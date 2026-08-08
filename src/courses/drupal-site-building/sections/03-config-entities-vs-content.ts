import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "config-entities-vs-content",
  title: "What the Clicks Create: Config Entities vs Content",
  part: "The Site-Builder Mindset",
  estMinutes: 12,
  summary:
    "Every admin-UI click mints either a config entity (exportable YAML: node.type, field.storage, field.field, views.view) or content (DB rows only) — and that decides whether it deploys via git or via migration.",

  concept: `
## Three clicks, three config entities

You already know Drupal splits its data into config and content. This lesson
pins down exactly *what each click in the admin UI creates*, because the answer
decides how the thing you just built reaches production.

Create a content type at **Structure > Content types > Add content type** and
Drupal mints a **config entity** named \`node.type.event\`. Build a listing at
**Structure > Views** and you get \`views.view.upcoming_events\`. Add a field
and you get *two* config entities (more below). None of this touched a PHP
file — yet all of it shows up in \`drush cex\` output as YAML you can diff,
review, and commit.

Now click **Content > Add content > Event** and fill in the form. That creates
a **content entity** — a node — and it exists only as database rows. Run
\`drush cex\` again and it reports the active configuration is identical to the
sync directory: nothing structural changed.

### The rule of thumb

**The structure of the site is config. The stuff users type into it is
content.** The Event content type is config; the 200 events are content. The
Tags vocabulary is config; the term "jazz" is content. The Editor role is
config; the user account that holds it is content.

## The field split: storage vs instance

Adding one brand-new field through the UI produces **two** YAML files, and the
split is deliberate:

- \`field.storage.node.field_event_date.yml\` — the **storage**: field name,
  data type, schema-level settings, and **cardinality** (how many values). One
  per field name *per entity type*, shared by every bundle. It owns the actual
  database tables.
- \`field.field.node.event.field_event_date.yml\` — the **instance**: the
  per-bundle label, description, required flag, and default value. One per
  bundle the field is attached to.

This is why the Add-field UI offers **"Re-use an existing field"**: attach
\`field_event_date\` to Page as well and Drupal creates only a second
\`field.field.*\` file — no new storage, no new tables — and both bundles
necessarily agree on type and cardinality, because those live in the shared
storage.

## Deployment consequences

The split dictates two different pipelines:

- **Config moves through git.** Build on local, \`drush cex\`, commit, open a
  PR (the YAML diff *is* the code review), deploy, \`drush cim\`. Every
  environment ends up structurally identical.
- **Content moves through migration or by hand.** Nodes, users, terms, and
  media never appear in \`config/sync\`. They travel via the Migrate API, a DB
  dump, or editors simply creating them on prod — which is fine, because prod
  is content's natural home.

The trap for a framework dev: editing structure directly on prod. The next
\`drush cim\` from git will happily revert it, because git — not the prod
database — is the source of truth for config.
`,

  comparisons: [
    {
      label: "Creating a content type",
      intro:
        "You need an 'Event' type with a title. The Symfony reflex is a new entity class plus a migration; in Drupal it's a form submit that mints a config entity.",
      php: `// The Symfony reflex: a new entity class + a migration.
#[ORM\\Entity]
class Event
{
    #[ORM\\Id, ORM\\GeneratedValue, ORM\\Column]
    private int $id;

    #[ORM\\Column(length: 255)]
    private string $title;
}
// bin/console make:migration
// bin/console doctrine:migrations:migrate`,
      ts: `# Structure > Content types > Add content type
#   (/admin/structure/types/add) — name it "Event", save.
# drush cex then writes config/sync/node.type.event.yml:
langcode: en
status: true
dependencies: {  }
name: Event
type: event
description: 'A dated event with a venue.'
help: ''
new_revision: true
preview_mode: 1
display_submitted: false`,
      note:
        "The whole content type is ~10 lines of exported YAML. No class, no migration — the config import system applies it to every environment.",
    },
    {
      label: "Adding a field: the two-YAML split",
      intro:
        "Add an 'Event date' field. One click-through creates TWO config entities: the storage (schema + cardinality, per entity type) and the instance (label + required, per bundle).",
      php: `// Adding a field = editing the class + a schema migration.
final class Version20260807A extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql(
            'ALTER TABLE event ADD event_date DATETIME NOT NULL'
        );
    }
}`,
      ts: `# Structure > Content types > Event > Manage fields >
#   Add field > Date > label "Event date" > Save.
# TWO files land in config/sync:

# field.storage.node.field_event_date.yml — the schema,
# shared by ALL node bundles; owns the DB tables:
id: node.field_event_date
field_name: field_event_date
entity_type: node
type: datetime
settings:
  datetime_type: datetime
cardinality: 1          # value count lives at storage level

# field.field.node.event.field_event_date.yml — the
# per-bundle instance: label, required, default value:
id: node.event.field_event_date
bundle: event
label: 'Event date'
required: true`,
      note:
        "storage = per-entity-type schema and cardinality; field.field = per-bundle settings. Memorise the split — it explains most field behaviour.",
    },
    {
      label: "Re-using a field on a second bundle",
      intro:
        "Basic pages should also carry an event date. In PHP you'd duplicate the property (or reach for a trait) plus another migration; Drupal shares the existing storage.",
      php: `// Sharing a column across entities: a trait, used by
// every class that needs it — plus another migration.
trait HasEventDate
{
    #[ORM\\Column(type: 'datetime_immutable')]
    private \\DateTimeImmutable $eventDate;
}
class Event { use HasEventDate; /* ... */ }
class Page  { use HasEventDate; /* ... */ }`,
      ts: `# Structure > Content types > Page > Manage fields >
#   Add field > "Re-use an existing field" > field_event_date
# Only ONE new file appears — the per-bundle instance:
#   field.field.node.page.field_event_date.yml
dependencies:
  config:
    - field.storage.node.field_event_date   # shared schema
    - node.type.page
id: node.page.field_event_date
field_name: field_event_date
entity_type: node
bundle: page
label: 'Event date'
required: false
# No second field.storage file, no new tables: one storage
# per field name per entity type, N per-bundle instances.`,
      note:
        "Both bundles share type, tables, and cardinality (storage-level) while keeping their own label and required flag (instance-level).",
    },
    {
      label: "Creating the content itself",
      intro:
        "Now make an actual event. In Symfony seed data is fixture code in the repo; in Drupal a node is content — DB rows that config export deliberately ignores.",
      php: `// Seeding data in Symfony: fixtures committed to the repo.
class EventFixtures extends Fixture
{
    public function load(ObjectManager $manager): void
    {
        $event = new Event();
        $event->setTitle('DrupalCon Vienna');
        $manager->persist($event);
        $manager->flush();
    }
}`,
      ts: `# Content > Add content > Event — fill in the form, Save.
# The node is database rows. Now try to export it:
drush config:export
 [notice] The active configuration is identical to the
 configuration in the sync directory.
# Nothing to commit: nodes, users, and terms are CONTENT.
# They move via the Migrate API or a DB dump — never cim.`,
      note:
        "Config export is blind to content by design. If you need seeded content across environments, that's a migration — not config.",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Six admin-UI actions: predict which mint config YAML (and how many files) and which only touch the database — then run to check the field.storage vs field.field counts.",
    code: `<?php
// Every admin-UI action mints CONFIG (exportable YAML)
// or CONTENT (database rows). Predict drush cex's output.

$actions = [
    [
        'ui'      => 'Structure > Content types > Add "Event"',
        'config'  => ['node.type.event'],
        'content' => [],
    ],
    [
        'ui'      => 'Event > Manage fields > Add "Event date" (new)',
        'config'  => [
            'field.storage.node.field_event_date',
            'field.field.node.event.field_event_date',
        ],
        'content' => [],
    ],
    [
        'ui'      => 'Page > Manage fields > Re-use field_event_date',
        'config'  => ['field.field.node.page.field_event_date'],
        'content' => [],
    ],
    [
        'ui'      => 'Structure > Views > Add "Upcoming events"',
        'config'  => ['views.view.upcoming_events'],
        'content' => [],
    ],
    [
        'ui'      => 'Content > Add content > "DrupalCon Vienna"',
        'config'  => [],
        'content' => ['node:41'],
    ],
    [
        'ui'      => 'People > Add user "maria"',
        'config'  => [],
        'content' => ['user:7'],
    ],
];

$yaml = [];
$db   = [];

foreach ($actions as $a) {
    foreach ($a['config'] as $name) {
        $yaml[] = $name . '.yml';
    }
    foreach ($a['content'] as $row) {
        $db[] = $row;
    }
}

echo "drush cex -> config/sync gains " . count($yaml) . " files:\\n";
foreach ($yaml as $file) {
    echo "  " . $file . "\\n";
}

echo "\\nStays in the database (never exported):\\n";
foreach ($db as $row) {
    echo "  " . $row . "\\n";
}

$storages  = count(array_filter($yaml,
    fn ($f) => str_starts_with($f, 'field.storage.')));
$instances = count(array_filter($yaml,
    fn ($f) => str_starts_with($f, 'field.field.')));

echo "\\nfield.storage files: " . $storages
    . " (one per field name per entity type)\\n";
echo "field.field files:   " . $instances
    . " (one per bundle the field is attached to)\\n";`,
    output: `drush cex -> config/sync gains 5 files:
  node.type.event.yml
  field.storage.node.field_event_date.yml
  field.field.node.event.field_event_date.yml
  field.field.node.page.field_event_date.yml
  views.view.upcoming_events.yml

Stays in the database (never exported):
  node:41
  user:7

field.storage files: 1 (one per field name per entity type)
field.field files:   2 (one per bundle the field is attached to)`,
  },

  keyPoints: [
    "Creating a content type mints a config entity (node.type.event); building a view mints views.view.X — both export to YAML with drush cex and deploy with drush cim.",
    "Adding a brand-new field creates TWO config entities: field.storage.* (data type, schema settings, cardinality — one per field name per entity type) and field.field.* (label, required, defaults — one per bundle).",
    "'Re-use an existing field' adds only another field.field.* instance; the storage and its DB tables are shared, so type and cardinality are identical across bundles.",
    "Nodes, users, taxonomy terms, and media are content entities: database rows only, never written to config/sync, never in git.",
    "Rule of thumb: the structure of the site is config; whatever users type into that structure is content.",
    "Two deploy pipelines: config = cex, git, PR review of the YAML diff, cim; content = Migrate API, DB dump, or editors creating it on prod. Never hand-edit structure on prod — the next cim reverts it.",
  ],

  interview: [
    {
      q: "What is the difference between field.storage and field.field config in Drupal, and why does the split exist?",
      a: "`field.storage.*` defines the field at the entity-type level: its machine name, data type, schema-level settings, and cardinality — and it owns the database tables. `field.field.*` is the per-bundle *instance*: label, description, required flag, and default value for one specific bundle. The split exists so a single field can be shared across bundles: attach the same field to Article and Page and you get one storage plus two instances, one set of tables, and guaranteed agreement on type and cardinality. It's roughly the difference between a column definition in a shared schema and per-use metadata about that column — except in Drupal both halves are exportable YAML, not PHP.",
    },
    {
      q: "You built a new content type with fields on your local site. Walk me through how it reaches production — and how that differs from getting editor-written articles there.",
      a: "The content type and its fields are config entities, so the pipeline is: `drush config:export` locally, which writes `node.type.*`, `field.storage.*`, and `field.field.*` YAML into `config/sync`; commit and push; peer-review the YAML diff like any code change; then on production, deploy the code and run `drush config:import`. The articles are a different animal entirely: nodes are content, they live only in the database, and `cex`/`cim` never touch them. If content genuinely has to move between environments you use the Migrate API or a database dump — but usually you don't, because production is where real content is created in the first place.",
    },
    {
      q: "How do you decide whether something you just made in the Drupal admin UI is config or content?",
      a: "Ask whether it's part of the site's *structure* or something a user *typed into* that structure. Content types, field definitions, Views, roles, image styles, menus-as-containers: structure, therefore config, therefore exportable YAML that should be identical on every environment. Nodes, users, taxonomy terms, media items, comments: data, therefore content, therefore DB-only and unique per environment. A quick empirical test is to run `drush config:export` after the action — if nothing changed in `config/sync`, you created content. Getting this instinct right matters because it decides whether the thing deploys through git or has to be migrated.",
    },
  ],

  quiz: [
    {
      question:
        "You add a brand-new 'Event date' field to the Event content type through the admin UI. What does Drupal create?",
      options: [
        "One config file: field.field.node.event.field_event_date",
        "Two config entities: a field.storage.* (schema/cardinality) and a field.field.* (per-bundle instance)",
        "A migration class you must commit to the repo",
        "Nothing exportable — fields are content",
      ],
      answerIndex: 1,
      explain:
        "A new field always produces the pair: field.storage.node.field_event_date (the entity-type-level schema, owning the DB tables and cardinality) plus field.field.node.event.field_event_date (the bundle-level label, required flag, and defaults). Re-using the field on another bundle later adds only another field.field.* instance.",
    },
    {
      question:
        "Where does a field's cardinality (how many values it can hold) live, and what does that imply?",
      options: [
        "In field.field.*, so each bundle can choose its own cardinality",
        "In field.storage.*, so every bundle sharing the field gets the same cardinality",
        "In the form display config, per widget",
        "In settings.php, per environment",
      ],
      answerIndex: 1,
      explain:
        "Cardinality is a storage-level setting because it shapes the underlying tables, which are shared by every bundle the field is attached to. Change it and you change it for all bundles at once — per-bundle differences live in field.field.* (label, required, defaults), never cardinality or data type.",
    },
    {
      question:
        "An editor creates 50 Event nodes on production. What appears the next time you run drush config:export there?",
      options: [
        "50 new YAML files in config/sync",
        "A diff inside node.type.event.yml",
        "No config changes — nodes are content and live only in the database",
        "A single node.event.content.yml containing all 50",
      ],
      answerIndex: 2,
      explain:
        "Nodes are content entities: database rows that the config system deliberately ignores. cex reports the active configuration is identical to the sync directory. Only structural changes (content types, fields, Views, roles) produce YAML — content moves via the Migrate API or a DB dump, if it moves at all.",
    },
  ],
};

export default lesson;
