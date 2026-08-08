import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "config-not-code",
  title: "Config, Not Code: The Site-Builder Mindset",
  part: "The Site-Builder Mindset",
  estMinutes: 12,
  summary:
    "The core shift: features a Symfony dev would code (entity, controller, template) are clicked together in Drupal's admin UI as config — and every click exports to deployable YAML.",

  concept: `
## Your instincts are expensive here

The brief: *"We need team member profiles — photo, job title, bio — and a page
at /team listing everyone alphabetically."*

Symfony muscle memory fires immediately: a \`TeamMember\` entity, a migration, a
repository method, a controller with \`#[Route('/team')]\`, a Twig template, a
\`FormType\` so editors can create entries, validation, some kind of admin CRUD,
access control. A solid day of work — then code review, then maintenance
forever.

A Drupal site builder ships the same feature before lunch, with **zero PHP**:

1. **Structure > Content types > Add content type** → name it *Team member* (2 min).
2. On its **Manage fields** tab, add *Job title* (Text, plain), *Bio* (Text,
   formatted long), *Photo* (Image) (5 min).
3. **Structure > Views > Add view** → show *Content* of type *Team member*
   sorted by *Title*; tick *Create a page* with path \`/team\` (5 min).

The editing form, validation, access checks, revisions, and the listing's pager
all come free — Drupal generates them from the same definitions.

## Nothing is lost: clicks become config

Here's the objection a framework dev raises: *"Great, but now my feature lives
in a database where nobody can review or deploy it."* That objection doesn't
hold in Drupal. Every one of those clicks created a **config entity** — the
content type, each field, the form and view displays, the View. They live in
*active configuration* (the database) while you work, and:

- \`drush config:export\` (\`cex\`) writes all of it to \`config/sync/\` as flat
  YAML: \`node.type.team_member.yml\`, \`field.field.node.team_member.field_job_title.yml\`,
  \`views.view.team.yml\`, and friends.
- You commit those files. The pull request shows a *readable diff* — a reviewer
  sees \`required: true\` appear on a field just like they'd see a changed
  constraint in an entity class.
- On staging and production, \`drush config:import\` (\`cim\`) — or the
  all-in-one \`drush deploy\` — replays the structure exactly. (There's a UI
  too, under **Configuration > Development > Configuration synchronization**,
  but real teams script it with Drush.)

So the clicking isn't a toy mode that serious teams outgrow. It's the authoring
interface for a data layer that is **versioned, reviewable, and repeatable** —
the same rigor you expect from code, without the code.

## When clicking beats coding

- **Speed** — 15 minutes vs a day, and the gap widens as the model grows.
- **Ownership** — a site builder or trained power user can extend the content
  model; a dev only re-enters the loop to export and deploy.
- **Upgrade safety** — config entities ride through core upgrades; custom PHP
  must chase API changes and deprecations release after release.
- **Free machinery** — forms, widgets, validation, permissions, revisions, and
  pagers are generated from config instead of hand-built and hand-tested.

Code still wins for genuine business logic, complex integrations, and custom
field types or plugins — a later section draws that boundary precisely. But the
default flips: **config first, code only when config can't.**
`,

  comparisons: [
    {
      label: "The content model: entity class vs content type",
      intro:
        "A 'Team member' with a job title and bio. In Symfony the model is a class you author and migrate; in Drupal it's a content type clicked into existence, captured as YAML.",
      php: `// Symfony: the model is PHP you own — plus a migration,
// a FormType, and CRUD screens still to build.
#[ORM\\Entity(repositoryClass: TeamMemberRepository::class)]
class TeamMember
{
    #[ORM\\Id, ORM\\GeneratedValue, ORM\\Column]
    private ?int $id = null;

    #[ORM\\Column(length: 255)]
    private string $name;

    #[ORM\\Column(length: 255)]
    private string $jobTitle;

    #[ORM\\Column(type: Types::TEXT)]
    private string $bio;
}
// bin/console make:migration && doctrine:migrations:migrate`,
      ts: `# Structure > Content types > Add content type
#   Name: "Team member" — enable "Create new revision" — Save.
# drush cex then writes config/sync/node.type.team_member.yml:
langcode: en
status: true
dependencies: {}
name: 'Team member'
type: team_member
description: 'A staff profile: photo, job title, bio.'
help: ''
new_revision: true
preview_mode: 1
display_submitted: false`,
      note:
        "The entire 'class' is ten lines of YAML produced by clicks. The built-in node title serves as the person's name — no id or name property to declare, no repository to register.",
    },
    {
      label: "Adding a field: migration vs Manage fields",
      intro:
        "Marketing wants a required 'Job title'. In Symfony that's a migration plus edits to the entity, form, and templates. In Drupal it's one field added in the UI.",
      php: `// Symfony: a new column means a migration you author...
final class Version20260807120000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql(
            'ALTER TABLE team_member '
            . 'ADD job_title VARCHAR(255) NOT NULL'
        );
    }
}
// ...then updating the entity class, the FormType,
// and every template that should show the value.`,
      ts: `# Team member > Manage fields > Create a new field
#   Type: Text (plain) — Label: "Job title" — Required — Save.
# The next drush cex adds TWO files: the reusable storage,
# and its attachment to this content type.

# field.storage.node.field_job_title.yml (trimmed)
id: node.field_job_title
field_name: field_job_title
entity_type: node
type: string
cardinality: 1

# field.field.node.team_member.field_job_title.yml (trimmed)
id: node.team_member.field_job_title
bundle: team_member
label: 'Job title'
required: true
field_type: string`,
      note:
        "Drupal also updates the form and view display config behind the scenes — the input widget and output formatter show up without touching a FormType or a template.",
    },
    {
      label: "The /team listing: controller vs Views",
      intro:
        "A page at /team listing published team members A→Z, ten per page. Symfony: route + query + template + pagination. Drupal: one View built in a wizard.",
      php: `// Symfony: route, controller, query, template — and
// pagination is still on you (or another bundle).
#[Route('/team', name: 'app_team')]
public function team(TeamMemberRepository $repo): Response
{
    return $this->render('team/index.html.twig', [
        'members' => $repo->findBy([], ['name' => 'ASC']),
    ]);
}
// team/index.html.twig: the loop, the markup,
// the pager links, the empty-state text...`,
      ts: `# Structure > Views > Add view
#   View name: Team
#   Show: Content — of type: Team member — sorted by: Title
#   [x] Create a page — Page title: Our team — Path: /team
#   Display format: Unformatted list of teasers — 10 items
#   Save and edit.
# drush cex -> config/sync/views.view.team.yml (trimmed):
id: team
label: Team
base_table: node_field_data
display:
  default:
    display_plugin: default
    display_options:
      title: 'Our team'
      filters:
        status: { value: '1' }              # published only
        type: { value: { team_member: team_member } }
      sorts:
        title: { order: ASC }
      pager:
        type: mini
        options: { items_per_page: 10 }
      row:
        type: 'entity:node'
        options: { view_mode: teaser }
  page_1:
    display_plugin: page
    display_options:
      path: team`,
      note:
        "Route, query, filters, sort, pager, and rendering — one config entity, zero PHP. The real export is longer, but every line of it was produced by the wizard.",
    },
    {
      label: "Deploying the feature",
      intro:
        "Getting the Team member feature onto production. Both stacks ship structure through git — Symfony as code and migrations, Drupal as exported config YAML.",
      php: `# Symfony: structure travels as code + migrations.
git push        # entity, migration, controller, twig

# on production:
git pull
composer install --no-dev
bin/console doctrine:migrations:migrate -n
bin/console cache:clear`,
      ts: `# Drupal: structure travels as exported config.
drush cex -y                 # DB config -> config/sync/*.yml
git add config/ && git commit -m "Team member + /team listing"
git push                     # the YAML diff gets code review

# on production:
git pull
drush deploy                 # updb + config:import + cache:rebuild
# (or step by step: drush cim -y && drush cr)`,
      note:
        "drush deploy replays your clicks on production exactly — same feature, no re-clicking, no drift between environments.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "You clicked the Team member feature together on dev, ran drush cex, and committed the YAML. This simulates what drush config:import computes on production: a diff of committed YAML vs the live site's active config. Predict the operations, then run.",
    code: `<?php
// config/sync = the YAML you exported and committed on dev.
$sync = [
    'core.extension' => ['modules' => ['field', 'node', 'views']],
    'node.type.team_member' => ['name' => 'Team member', 'new_revision' => true],
    'field.storage.node.field_job_title' => ['type' => 'string', 'cardinality' => 1],
    'field.field.node.team_member.field_job_title' => ['label' => 'Job title', 'required' => true],
    'views.view.team' => ['label' => 'Team', 'path' => '/team', 'sort' => 'title ASC'],
];

// Active config = what production's database holds right now.
$active = [
    'core.extension' => ['modules' => ['field', 'node', 'views']],
    'node.type.article' => ['name' => 'Article', 'new_revision' => true],
    'views.view.team' => ['label' => 'Our people', 'path' => '/team', 'sort' => 'created DESC'],
];

// Sync is declarative: import makes active config MATCH it —
// creating, updating, and even deleting to get there.
$ops = [];
foreach ($sync as $name => $data) {
    if (!array_key_exists($name, $active)) {
        $ops[$name] = 'create';
    } elseif ($active[$name] !== $data) {
        $ops[$name] = 'update';
    }
}
foreach ($active as $name => $data) {
    if (!array_key_exists($name, $sync)) {
        $ops[$name] = 'delete';
    }
}

echo "drush config:import will apply:\\n\\n";
foreach ($ops as $name => $op) {
    printf("%-7s %s\\n", $op, $name);
}
echo "\\n" . count($ops) . " operations: the whole feature ships as data, not PHP.\\n";`,
    output: `drush config:import will apply:

create  node.type.team_member
create  field.storage.node.field_job_title
create  field.field.node.team_member.field_job_title
update  views.view.team
delete  node.type.article

5 operations: the whole feature ships as data, not PHP.`,
  },

  keyPoints: [
    "A 'Team member section with a /team listing' is a content type + fields + a View — roughly 15 minutes of clicking vs a day of entity/migration/controller/template work in Symfony.",
    "Every admin-UI click creates or updates a config entity in active configuration — nothing lives 'only in the UI'.",
    "drush cex exports all of it to config/sync as YAML (node.type.*, field.storage.*, field.field.*, views.view.*) — versioned, code-reviewed, and deployed with drush cim or drush deploy.",
    "UI-built features come with free machinery: edit forms, validation, access checks, revisions, and pagers are generated from the same config.",
    "Click-first wins on speed, non-developer ownership, and upgrade safety; custom code remains the right tool for business logic, integrations, and custom plugins.",
    "Config import is declarative — it makes the target site match the committed YAML exactly, so environments can't silently drift.",
  ],

  interview: [
    {
      q: "Walk me through shipping a 'Team member' section with a /team listing page in Drupal. How much code do you write?",
      a: "For the base feature: none. I create a *Team member* content type under **Structure > Content types**, add Job title, Bio, and Photo fields on its Manage fields tab, then build a View at **Structure > Views > Add view** showing published Team member content sorted by title, with a page display at `/team`. All of that is stored as config entities, so I run `drush cex`, commit the resulting YAML (`node.type.team_member.yml`, the field configs, `views.view.team.yml`), and it deploys through the normal pipeline with `drush deploy`. Drupal generates the editor form, validation, and pager for free. I'd only open an IDE if the feature needed real business logic that config can't express.",
    },
    {
      q: "If features are built by clicking in a database-backed admin UI, how do you keep environments in sync and do code review?",
      a: "Through configuration management, which is core Drupal. Clicks write to *active configuration* in the database; `drush config:export` serializes all of it to flat YAML in the `config/sync` directory, which is committed to git. A pull request then shows a readable structural diff — a new `required: true`, a changed sort order in a View — that reviewers approve like any code change. Deployment runs `drush config:import` (usually via `drush deploy`), which makes the target environment match the committed YAML exactly, including deleting config that was removed. So the UI is just the authoring tool; git remains the source of truth for structure.",
    },
    {
      q: "As a Symfony developer, what do you gain by building in Drupal's UI instead of writing the equivalent code — and what's the trade-off?",
      a: "The gains are speed and scope: a content model plus listing that would take a day of entity, migration, controller, and template work takes minutes, and it arrives with generated forms, validation, permissions, and revisions I'd otherwise hand-build. It also shifts ownership — site builders can evolve the model without a developer — and it's upgrade-safe, since config entities ride through core updates while custom code has to chase API deprecations. The trade-off is that I'm composing generic building blocks, so genuinely custom behavior — complex business rules, external integrations, bespoke field types — still needs code. The skill being tested is knowing that boundary and defaulting to config first.",
    },
  ],

  quiz: [
    {
      question:
        "You just clicked Save on a new 'Team member' content type. Where does its definition live at that moment?",
      options: [
        "In a generated PHP class inside a custom module",
        "In active configuration in the database, until you export it to YAML",
        "Directly in a YAML file that Drupal wrote into your git repository",
        "Nowhere durable — UI-built structure must be rebuilt on each environment",
      ],
      answerIndex: 1,
      explain:
        "Admin-UI clicks create config entities in active configuration, which is stored in the database. Nothing is written to your repo until you run drush config:export (cex), which serializes active config to YAML in config/sync for committing and deploying. No PHP class is ever generated.",
    },
    {
      question:
        "Which sequence correctly deploys a UI-built feature from dev to production?",
      options: [
        "Rebuild the feature by hand in production's admin UI",
        "drush cex on dev → commit the YAML → drush cim (or drush deploy) on production",
        "Copy the dev database over the production database",
        "drush cim on dev → push → drush cex on production",
      ],
      answerIndex: 1,
      explain:
        "Export on the environment where you built (cex writes DB config to config/sync YAML), commit, then import on the target (cim applies the YAML to its database). drush deploy wraps updb + cim + cache rebuild. Re-clicking causes drift, and a DB copy would clobber production content.",
    },
    {
      question:
        "How much custom PHP does the basic /team listing page (published team members, A→Z, paged) require?",
      options: [
        "A route attribute and a controller, at minimum",
        "A repository method for the query, but no controller",
        "None — a Views config entity declares the path, filters, sort, and pager",
        "A Twig template, since Drupal cannot render lists without one",
      ],
      answerIndex: 2,
      explain:
        "The Views wizard produces a single config entity (views.view.team.yml) that declares the page path, the published + content-type filters, the title sort, the pager, and how rows render. Route, query, and markup are all handled by core from that config — no PHP or Twig authored by you.",
    },
  ],
};

export default lesson;
