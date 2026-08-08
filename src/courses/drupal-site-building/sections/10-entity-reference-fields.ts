import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "entity-reference-fields",
  title: "Entity References: Relations Without Join Annotations",
  part: "Content Modeling in the UI",
  estMinutes: 12,
  summary:
    "An entity reference field is Drupal's ManyToOne/ManyToMany: pick a target type and bundles in the UI, choose a widget and formatter, and the whole relation — schema included — becomes exportable YAML.",

  concept: `
In Doctrine, a relation is code: a typed property, a \`#[ORM\\ManyToOne]\` or
\`#[ORM\\ManyToMany]\` attribute, maybe a \`#[ORM\\JoinTable]\`, then a migration.
In Drupal, a relation is a **field** — the \`entity_reference\` field type —
added in the admin UI and exported as config. The "join" is field config.

### Anatomy: target_type, then target_bundles

Creating one (*Structure > Content types > Article > Manage fields > Create a
new field > Reference > Content* in Drupal 10.2+/11) produces the same two
config entities as any field:

- **Storage** (\`field.storage.node.field_author.yml\`) fixes the
  \`target_type\` — \`node\`, \`user\`, \`taxonomy_term\`, \`media\` — the analogue
  of Doctrine's \`targetEntity\`. Cardinality lives here too.
- **Instance** (\`field.field.node.article.field_author.yml\`) narrows to
  allowed \`target_bundles\` (e.g. only *Author profile* nodes), sets the
  option sort, and can enable \`auto_create\`.

Drupal provisions the columns (\`field_author_target_id\`); you never write the
foreign key.

### Reference method: default, or a View

The instance also picks a **selection handler**. The default
(\`default:node\`) offers published nodes of the allowed bundles, sorted per
config. When you need the option list filtered or ordered beyond that — the
job you would give a \`query_builder\` closure in a Symfony \`EntityType\` —
you build a View with an **Entity Reference** display (its filters and sorts
define the candidates, its "Search fields" drive matching) and set the field's
reference method to *Views: Filter by an entity reference view*.

### Widgets: how editors pick

On *Manage form display* you choose the input: **Autocomplete**,
**Autocomplete (Tags style)** — comma-separated, creates new terms on the fly
when \`auto_create\` is on — **Select list**, or **Check boxes/radio buttons**.
Swapping a dropdown for checkboxes is a widget change, not a form rewrite.

### Cardinality: many-to-many with zero schema work

Every configurable field already lives in its own dedicated table
(\`node__field_tags\`: \`entity_id\`, \`delta\`, \`field_tags_target_id\`) — even
a single-value field, whose rows just always sit at \`delta\` 0. Set *Allowed
number of values* to **Unlimited** and that same table now holds multiple
ordered rows per entity: the many-to-many \`#[ORM\\JoinTable]\` makes you
declare and migrate, with zero DDL from you.

### Display: label link or the whole entity

On *Manage display* the formatter decides depth: **Label** renders the
referenced entity's title (optionally linked), **Rendered entity** embeds the
full entity through a view mode you pick — the no-code version of including a
\`_card.html.twig\` partial — and **Entity ID** prints the raw target id.

### Patterns, and the missing direction

Classic uses: *Article → Author profile* node (rich author bios without a
custom entity) and *Product → Brand* term. Note the field points **forward**
only. "All articles by this author" does not mean adding a field to the
author — the reverse direction is a Views relationship or contextual filter,
coming in section 15.
`,

  comparisons: [
    {
      label: "ManyToOne: Article → Author profile",
      intro:
        "One article references one author profile. Symfony: attribute + migration. Drupal: an entity reference field clicked together, exported as two YAML files.",
      php: `<?php
// Symfony: the relation is an ORM attribute plus a migration.
namespace App\\Entity;

use Doctrine\\ORM\\Mapping as ORM;

#[ORM\\Entity]
class Article
{
    #[ORM\\ManyToOne(targetEntity: AuthorProfile::class)]
    #[ORM\\JoinColumn(nullable: false)]
    private ?AuthorProfile $author = null;
}

// Then:
//   php bin/console doctrine:migrations:diff
//   php bin/console doctrine:migrations:migrate`,
      rightLang: "yaml",
      ts: `# Structure > Content types > Article > Manage fields
#   > Create a new field > Reference > Content > label "Author"
#   > Content type: [x] Author profile; Sort by: Title, Ascending
# Then drush config:export writes two files:

# field.storage.node.field_author.yml
field_name: field_author
entity_type: node
type: entity_reference
settings:
  target_type: node        # Doctrine's targetEntity
cardinality: 1
---
# field.field.node.article.field_author.yml
bundle: article
label: Author
required: true
settings:
  handler: default:node
  handler_settings:
    target_bundles:
      author_profile: author_profile
    sort:
      field: title
      direction: ASC`,
      note:
        "target_type is fixed at the storage level; target_bundles narrows it per instance. Drupal creates the field_author_target_id column — no JoinColumn, no migration.",
    },
    {
      label: "ManyToMany with zero schema work",
      intro:
        "Unlimited tags on an article. Symfony needs a JoinTable and a Collection; in Drupal it is the same field UI with cardinality set to Unlimited — the field's dedicated table already exists, it just gets to hold multiple rows per article.",
      php: `<?php
namespace App\\Entity;

use Doctrine\\Common\\Collections\\ArrayCollection;
use Doctrine\\Common\\Collections\\Collection;
use Doctrine\\ORM\\Mapping as ORM;

#[ORM\\Entity]
class Article
{
    #[ORM\\ManyToMany(targetEntity: Tag::class)]
    #[ORM\\JoinTable(name: 'article_tag')]
    private Collection $tags;

    public function __construct()
    {
        $this->tags = new ArrayCollection();
    }
}
// ...and another migration for the article_tag join table.`,
      rightLang: "yaml",
      ts: `# Same UI, two settings changed:
#   Create a new field > Reference > Taxonomy term > "Tags"
#   Allowed number of values: Unlimited
#   Manage form display > widget: Autocomplete (Tags style)

# field.storage.node.field_tags.yml
type: entity_reference
settings:
  target_type: taxonomy_term
cardinality: -1              # unlimited = your many-to-many
---
# field.field.node.article.field_tags.yml
settings:
  handler: default:taxonomy_term
  handler_settings:
    target_bundles:
      tags: tags
    auto_create: true        # typing a new term creates it
---
# core.entity_form_display.node.article.default.yml (excerpt)
content:
  field_tags:
    type: entity_reference_autocomplete_tags
    settings:
      match_operator: CONTAINS`,
      note:
        "Every configurable field gets its own node__field_tags-style table (entity_id, delta, target_id) whatever its cardinality; cardinality: -1 lets that table hold multiple ordered delta rows per entity — a join table you never declared. The widget is config on the form display, not form code.",
    },
    {
      label: "Filtered options: query_builder vs a View as selection handler",
      intro:
        "The author dropdown must only offer on-staff profiles, ordered by name. In Symfony that is a query_builder closure in a FormType; in Drupal you point the field at a View.",
      php: `<?php
// Symfony FormType: options come from a repository query.
use Doctrine\\ORM\\EntityRepository;
use Symfony\\Bridge\\Doctrine\\Form\\Type\\EntityType;

$builder->add('author', EntityType::class, [
    'class' => AuthorProfile::class,
    'choice_label' => 'name',
    'query_builder' => fn (EntityRepository $r) => $r
        ->createQueryBuilder('a')
        ->where('a.onStaff = true')
        ->orderBy('a.name', 'ASC'),
]);`,
      rightLang: "yaml",
      ts: `# 1. Structure > Views > Add view > "Author picker"
#    Show Content of type Author profile.
#    Add an "Entity Reference" display; set Search fields (Title),
#    filter On staff = Yes, sort Title ascending.
# 2. On the field: Reference method:
#    "Views: Filter by an entity reference view" > Author picker.

# field.field.node.article.field_author.yml (settings excerpt)
settings:
  handler: views
  handler_settings:
    view:
      view_name: author_picker
      display_name: entity_reference_1
      arguments: []`,
      note:
        "The View owns the WHERE and ORDER BY of the option list. Change who is selectable by editing the View — no FormType redeploy, and the wiring is still just config.",
    },
    {
      label: "Display side: label link vs fully rendered entity",
      intro:
        "Show the author on the article page — as a linked name, or as a full author card. Symfony decides in Twig; Drupal decides with a formatter choice on Manage display.",
      php: `<?php
// Symfony: the template decides how deep to render the relation.
final class ArticleController extends AbstractController
{
    public function show(Article $article): Response
    {
        return $this->render('article/show.html.twig', [
            'article' => $article,
        ]);
    }
}
// show.html.twig — a link, or a whole embedded partial:
//   <a href="{{ path('author_show', {id: article.author.id}) }}">
//     {{ article.author.name }}</a>
//   {# or #}
//   {% include 'author/_card.html.twig' with {author: article.author} %}`,
      rightLang: "yaml",
      ts: `# Structure > Content types > Article > Manage display
#   field_author > Format:
#     "Label"           -> linked title, cheap
#     "Rendered entity" -> full render through a view mode
#     "Entity ID"       -> raw target_id

# core.entity_view_display.node.article.default.yml (excerpt)
content:
  field_author:
    type: entity_reference_label
    label: above
    settings:
      link: true
---
# Swap the formatter, not the template:
content:
  field_author:
    type: entity_reference_entity_view
    settings:
      view_mode: compact   # Author profile's "compact" view mode
      link: false`,
      note:
        "Rendered entity + a view mode is the no-code {% include %}: the author card's own display config decides what shows, and every article picks it up.",
    },
  ],

  playground: {
    intro:
      "Plain PHP model of what the two selection handlers do with the exported field config: the default handler filters by target_bundles and sorts; a Views handler layers the View's own filters on top. Then the multi-value save shows the delta rows Drupal writes for you.",
    lang: "php",
    code: `<?php
// The "join" is config: simulate entity_reference selection handlers
// building the options an editor can pick, straight from field YAML.

$nodes = [
  1 => ['bundle' => 'author_profile', 'title' => 'Nadia Reyes',        'on_staff' => 1],
  2 => ['bundle' => 'author_profile', 'title' => 'Marcus Chen',        'on_staff' => 1],
  3 => ['bundle' => 'author_profile', 'title' => 'Alumni: Priya Nair', 'on_staff' => 0],
  4 => ['bundle' => 'page',           'title' => 'About Us',           'on_staff' => 1],
];

// From field.field.node.article.field_author.yml
$handlerSettings = [
  'target_bundles' => ['author_profile' => 'author_profile'],
  'sort'           => ['field' => 'title', 'direction' => 'ASC'],
];

function buildOptions(array $nodes, array $settings, bool $viewsFilter): array {
  $options = [];
  foreach ($nodes as $id => $n) {
    if (!isset($settings['target_bundles'][$n['bundle']])) {
      continue;                    // bundle not allowed by config
    }
    if ($viewsFilter && $n['on_staff'] !== 1) {
      continue;                    // the View's "On staff = Yes" filter
    }
    $options[$id] = $n['title'];
  }
  asort($options);                 // sort.field = title, ASC
  return $options;
}

echo "handler: default:node ->\\n";
foreach (buildOptions($nodes, $handlerSettings, false) as $id => $title) {
  echo "  {$title} ({$id})\\n";
}

echo "\\nhandler: views (View adds On staff = Yes) ->\\n";
foreach (buildOptions($nodes, $handlerSettings, true) as $id => $title) {
  echo "  {$title} ({$id})\\n";
}

// Multi-value save: the field's table always stores delta rows;
// cardinality -1 allows several per entity — a join table you never migrated.
$saved = [2, 1];   // editor picked Marcus, then Nadia
echo "\\nnode__field_author rows for article 42 (cardinality -1):\\n";
foreach ($saved as $delta => $target) {
  echo "  entity_id=42  delta={$delta}  field_author_target_id={$target}\\n";
}`,
    output: `handler: default:node ->
  Alumni: Priya Nair (3)
  Marcus Chen (2)
  Nadia Reyes (1)

handler: views (View adds On staff = Yes) ->
  Marcus Chen (2)
  Nadia Reyes (1)

node__field_author rows for article 42 (cardinality -1):
  entity_id=42  delta=0  field_author_target_id=2
  entity_id=42  delta=1  field_author_target_id=1`,
  },

  keyPoints: [
    "An entity reference field IS the relation: \`target_type\` on the storage config is Doctrine's \`targetEntity\`; \`target_bundles\` on the instance narrows it to specific bundles.",
    "Reference method = the option query: the default handler gives published targets of allowed bundles sorted per config; a View with an Entity Reference display replaces a \`query_builder\` closure.",
    "Widgets are form-display config, not form code: Autocomplete, Autocomplete (Tags style, with \`auto_create\`), Select list, Check boxes/radio buttons.",
    "Cardinality Unlimited (\`cardinality: -1\`) is a many-to-many with zero schema work — every configurable field already lives in its own \`node__field_x\` delta table (single-value fields just always write \`delta\` 0); Unlimited lets that table hold multiple ordered rows per entity, replacing \`#[ORM\\JoinTable]\` plus a migration.",
    "Display formatters set render depth: Label (linked title), Rendered entity (embeds via a view mode — the no-code partial include), Entity ID.",
    "The field only points forward; listing 'all articles referencing this author' needs a Views relationship or contextual filter (section 15).",
  ],

  interview: [
    {
      q: "How would you model an Article-to-Author relation in Drupal without code, and where did the Doctrine join go?",
      a: "I'd add an **entity reference field** to the Article content type in the UI: *Manage fields > Create a new field > Reference > Content*, restricted to the *Author profile* bundle. That produces two config entities — \`field.storage.node.field_author.yml\` fixing \`target_type: node\` and cardinality, and \`field.field.node.article.field_author.yml\` holding \`target_bundles\`, sort, and required — and Drupal provisions the \`field_author_target_id\` column itself. The 'join' that Doctrine expresses as \`#[ORM\\ManyToOne]\` plus a migration is entirely field config here, deployed with \`drush config:import\`.",
    },
    {
      q: "The author dropdown must only show on-staff profiles sorted by name — in Symfony you'd write a query_builder. What's the Drupal way?",
      a: "Change the field's **reference method**, not code. The default \`default:node\` handler already limits options to published nodes of the allowed bundles with a configurable sort; for anything richer I'd build a View with an **Entity Reference** display — filter *On staff = Yes*, sort by title, set the search fields — and select *Views: Filter by an entity reference view* on the field. The field config then stores \`handler: views\` with the view and display name. Editorial rules about who is selectable become an editable View instead of a FormType redeploy.",
    },
    {
      q: "What does multi-value cardinality on a reference field buy you compared to a Doctrine ManyToMany?",
      a: "Functionally the same relation with none of the schema work. Every configurable field already lives in a dedicated table Drupal creates and manages (\`node__field_tags\` with \`entity_id\`, \`delta\`, \`target_id\`) — even at cardinality 1, where \`delta\` is always 0. Setting *Allowed number of values* to Unlimited writes \`cardinality: -1\` into the storage config and lets that table hold multiple ordered rows per entity — the many-to-many \`#[ORM\\JoinTable]\` makes you declare, generate a migration for, and maintain. Delta preserves the editor's ordering, which a bare join table doesn't give you for free. Pair it with the Tags-style autocomplete widget and \`auto_create: true\` and editors can even mint new terms inline.",
    },
    {
      q: "You have Article → Author. How do you show all articles by a given author, since there's no field on the author side?",
      a: "You don't add a mirror field — that would be denormalizing and would drift. The reverse direction is a **query concern**, so it belongs to Views: a view of Content with either a relationship through the reference field or a contextual filter on \`field_author.target_id\` (typically taking the author node ID from the URL). That's the site-building equivalent of Doctrine's \`inversedBy\`/\`mappedBy\` plus a repository query, and it's covered in depth in the Views contextual filters and relationships section.",
    },
  ],

  quiz: [
    {
      question:
        "Where do target_type and target_bundles live for an entity reference field?",
      options: [
        "Both on the field instance (field.field.*) so each bundle can reference anything",
        "target_type on the storage config (field.storage.*); target_bundles on the instance (field.field.*)",
        "Both in the entity class's baseFieldDefinitions()",
        "target_type in settings.php; target_bundles in the theme",
      ],
      answerIndex: 1,
      explain:
        "The storage config fixes what entity type is referenced (and cardinality) and is shared across bundles; each instance narrows the allowed bundles via handler_settings.target_bundles and sets sort/auto_create.",
    },
    {
      question:
        "You need the reference widget to offer only entities matching custom filters and ordering — the job of a Symfony query_builder. What do you configure?",
      options: [
        "A hook_form_alter that rewrites the options array",
        "A custom SelectionHandler plugin — this always requires code",
        "Set the field's reference method to 'Views: Filter by an entity reference view' backed by a View with an Entity Reference display",
        "Edit the autocomplete widget's match_operator to CONTAINS",
      ],
      answerIndex: 2,
      explain:
        "The Views selection handler delegates the candidate query to a View's Entity Reference display — its filters, sorts, and search fields define the options. The field config just stores handler: views with the view and display names.",
    },
    {
      question:
        "Setting a reference field's 'Allowed number of values' to Unlimited requires which schema work?",
      options: [
        "A hand-written join-table migration, like Doctrine's JoinTable",
        "An ALTER TABLE adding an array column",
        "None — Drupal creates and manages a dedicated delta table (entity_id, delta, target_id)",
        "Enabling a contrib module that provides multi-value storage",
      ],
      answerIndex: 2,
      explain:
        "The field system already stores every configurable field's values as delta rows in its own table (e.g. node__field_tags); cardinality: -1 in the storage config just permits multiple rows per entity. It's a many-to-many with ordering, and you never write the DDL.",
    },
    {
      question:
        "On Manage display, which formatter is the no-code equivalent of embedding an author-card Twig partial?",
      options: [
        "Label with 'Link to the referenced entity' enabled",
        "Rendered entity, with the view mode picked for the referenced entity",
        "Entity ID",
        "Plain text",
      ],
      answerIndex: 1,
      explain:
        "entity_reference_entity_view renders the whole referenced entity through a view mode you choose — the referenced bundle's own display config decides what appears. Label only outputs the (optionally linked) title.",
    },
  ],
};

export default lesson;
