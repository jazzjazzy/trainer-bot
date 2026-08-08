import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "taxonomy",
  title: "Taxonomy: Structured Categorization for Free",
  part: "Content Modeling in the UI",
  estMinutes: 11,
  summary:
    "Vocabularies (config) hold hierarchical, fieldable terms (content) — attach them with a reference field and Drupal hands you term pages, breadcrumbs, and tagging UI you'd otherwise hand-roll.",

  concept: `
## One system, two kinds of data

\`Structure > Taxonomy\` is Drupal's categorization system, and it splits cleanly
along the config/content line you already know:

- A **vocabulary** ("Topics", "Regions", "Tags") is a **config entity** —
  \`taxonomy.vocabulary.topics\` — created in the UI and exported to YAML like a
  content type.
- The **terms** inside it ("Symfony", "Drupal", "Caching") are **content
  entities**: rows in the database, created by editors, never exported by
  \`drush cex\`.

Terms are real entities, not enum strings. They are **hierarchical** (each term
has a parent, so "PHP > Frameworks > Symfony" is just data), **orderable**
(drag-and-drop weights at \`/admin/structure/taxonomy/manage/topics/overview\`),
and **fieldable** — you can add an image, a color, or a description field to the
terms themselves via Manage fields, exactly as you do on a content type.

## Attaching terms: it's just an entity reference

You connect content to taxonomy with an **entity reference field** on the
content type (\`target_type: taxonomy_term\`, limited to one or more
vocabularies via \`target_bundles\`). Two editorial flavors, chosen per field:

- **Curated**: a select list or checkboxes over a fixed vocabulary that only
  admins edit. Think "Department" or "Region".
- **Folksonomy — the "tags" pattern**: the autocomplete *tags* widget
  (\`entity_reference_autocomplete_tags\`) with \`auto_create: true\` in the
  field's handler settings. Editors type freely; unknown input becomes a new
  term on save. This is exactly what the standard profile ships on Article's
  \`field_tags\`.

## What you get for free

In Symfony, a category system means an entity, a self-referencing relation, an
admin CRUD, a landing page per category, and breadcrumb logic. Drupal gives you:

- **Term pages**: \`/taxonomy/term/12\` already lists all content tagged with
  term 12. It's a core View (\`views.view.taxonomy_term\`), so you reshape it in
  the Views UI — teasers, exposed sorts, a different pager — without code.
- **Breadcrumbs**: the taxonomy module builds term-page breadcrumbs from the
  hierarchy (Home » PHP » Frameworks) automatically.
- **Views integration**: "Has taxonomy term" filters, contextual filters, and
  *with depth* options that include child terms in a parent's listing.

## Taxonomy or a content type?

Rule of thumb: **terms are classification labels with light fields; content
types are rich standalone content.** If the thing mostly *describes other
content* and needs at most a description and an image, it's a term. If it needs
a body, its own workflow/moderation, revisions, and a designed page — make it a
content type ("Region" is a term; "Office" with address, staff, and photos is a
content type). Migrating from one to the other later is painful, so decide early.

## The deployment gotcha

\`drush cex\` exports the vocabulary — **not the terms**. Term IDs are
auto-increment, so tid 7 on dev is not tid 7 on prod. Never hardcode tids in
config or code. Seed shared terms with a migration or the \`default_content\`
module (which exports terms with stable UUIDs), and reference terms by UUID or
name when you must.
`,

  comparisons: [
    {
      label: "A category tree",
      intro:
        "You need hierarchical, reorderable categories with an admin UI. In Symfony that's a self-referencing entity plus CRUD; in Drupal it's one vocabulary and free drag-and-drop term management.",
      php: `// Symfony: a self-referencing Doctrine entity...
#[ORM\\Entity]
class Category
{
    #[ORM\\Column(length: 255)]
    private string $name;

    #[ORM\\ManyToOne(targetEntity: self::class, inversedBy: 'children')]
    private ?Category $parent = null;

    #[ORM\\OneToMany(mappedBy: 'parent', targetEntity: self::class)]
    private Collection $children;

    #[ORM\\Column]
    private int $position = 0; // manual ordering
}
// ...plus a migration, a repository tree query, and an
// admin CRUD with re-parenting and drag-to-reorder.`,
      ts: `# Structure > Taxonomy > Add vocabulary
#   Name: Topics  ->  machine name: topics
# Terms are managed (added, nested, dragged into order) at:
#   /admin/structure/taxonomy/manage/topics/overview
# drush cex captures ONLY the vocabulary definition:
# config/sync/taxonomy.vocabulary.topics.yml
langcode: en
status: true
dependencies: {  }
name: Topics
vid: topics
description: 'Editorial subject areas.'
weight: 0
new_revision: false`,
      note:
        "The whole tree UI — hierarchy, drag-ordering, per-term edit forms — exists the moment the vocabulary does. The terms themselves are content: they live in the DB, not in this YAML.",
    },
    {
      label: "Tagging content (the 'tags' pattern)",
      intro:
        "Editors should tag articles by typing, with new tags created on the fly. In Symfony that's a ManyToMany plus custom JS; in Drupal it's one reference field with auto_create.",
      php: `// Symfony: join table + form type + custom endpoint.
#[ORM\\Entity]
class Article
{
    #[ORM\\ManyToMany(targetEntity: Category::class)]
    #[ORM\\JoinTable(name: 'article_category')]
    private Collection $categories;
}

// FormType: a multi-select of existing categories...
$builder->add('categories', EntityType::class, [
    'class' => Category::class,
    'choice_label' => 'name',
    'multiple' => true,
]);
// "type to create a new tag" = a JS autocomplete plus a
// controller endpoint that inserts unknown names first.`,
      ts: `# Structure > Content types > Article > Manage fields >
#   Add field > Reference > Taxonomy term -> "Topics"
# Manage form display: widget = "Autocomplete (Tags style)"
# config/sync/field.field.node.article.field_topics.yml (trimmed)
id: node.article.field_topics
field_name: field_topics
entity_type: node
bundle: article
label: Topics
field_type: entity_reference
settings:
  handler: 'default:taxonomy_term'
  handler_settings:
    target_bundles:
      topics: topics
    auto_create: true
# Unknown input in the autocomplete now becomes a new
# term on save — no JS, no endpoint, no insert code.`,
      note:
        "auto_create in handler_settings plus the entity_reference_autocomplete_tags widget IS the tagging feature. Storage-level config (field.storage.node.field_topics.yml) sets target_type: taxonomy_term and cardinality: -1.",
    },
    {
      label: "The category landing page",
      intro:
        "Every category needs a page listing its content, with breadcrumbs reflecting the hierarchy. You'd code a route, query, and breadcrumb builder — Drupal already shipped the page.",
      php: `// Symfony: a route + query + template + breadcrumbs.
#[Route('/category/{slug}', name: 'category_show')]
public function show(Category $category,
                     ArticleRepository $repo): Response
{
    $crumbs = [];
    for ($c = $category; $c !== null; $c = $c->getParent()) {
        array_unshift($crumbs, $c);
    }
    return $this->render('category/show.html.twig', [
        'category' => $category,
        'crumbs'   => $crumbs,
        'articles' => $repo->findByCategory($category),
    ]);
}`,
      ts: `# Nothing to build. Core already serves
#   /taxonomy/term/12  -> all content tagged with term 12,
# and the taxonomy module builds the breadcrumb from the
# term hierarchy (Home » PHP » Frameworks).
# The listing is a core View you can reshape in the UI
# (Structure > Views > "Taxonomy term"):
# views.view.taxonomy_term.yml (trimmed)
id: taxonomy_term
label: 'Taxonomy term'
base_table: node_field_data
display:
  page_1:
    display_plugin: page
    display_options:
      path: taxonomy/term/%
# Want teasers, an exposed sort, a different pager?
# Edit the view — still zero PHP.`,
      note:
        "The term page is not magic — it's an ordinary View shipped by core, overridable per site. Pathauto (a contrib staple) turns /taxonomy/term/12 into /topics/php.",
    },
    {
      label: "Deploying the category tree",
      intro:
        "Ship the 'Topics' system from dev to prod. The vocabulary travels in git; the terms do not — and their IDs won't match across environments.",
      php: `// Symfony: fixtures/migrations seed categories, and the
// same inserts run everywhere, so IDs line up.
class CategoryFixtures extends Fixture
{
    public function load(ObjectManager $manager): void
    {
        foreach (['PHP', 'Symfony', 'Drupal'] as $name) {
            $manager->persist(new Category($name));
        }
        $manager->flush();
    }
}`,
      ts: `git pull && drush cim -y
# Imports taxonomy.vocabulary.topics (and the field config)
# but NOT one single term — terms are content.
# tid 7 on dev is NOT tid 7 on prod (auto-increment).
#
# Seeding shared terms, pick one:
#   - default_content module: exports terms with stable
#     UUIDs, recreated on install/deploy
#   - a migration (migrate_plus + migrate_tools):
#     drush migrate:import seed_topics
#
# Rule: reference terms by UUID or name in code and
# config — never by hardcoded tid.`,
      note:
        "This is the classic taxonomy deploy trap: a View or block configured against tid 7 on dev silently targets a different term (or nothing) on prod.",
      leftLang: "php",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Simulate what core gives you free at /taxonomy/term/{tid}: a breadcrumb walked up the term hierarchy, the tagged-content listing, and the tags widget's auto-create. Predict the output, then run.",
    code: `<?php
// Terms are CONTENT entities: DB rows, each with a parent pointer.
$terms = [
    1 => ['name' => 'PHP',        'parent' => 0],
    2 => ['name' => 'Frameworks', 'parent' => 1],
    3 => ['name' => 'Symfony',    'parent' => 2],
    4 => ['name' => 'Drupal',     'parent' => 2],
];

// Nodes point at terms via an entity reference field.
$nodes = [
    ['title' => 'Dependency Injection in Drupal', 'field_topics' => [4]],
    ['title' => 'Symfony Routing Deep Dive',      'field_topics' => [3]],
    ['title' => 'Choosing a PHP Framework',       'field_topics' => [2, 1]],
];

// TermBreadcrumbBuilder, in miniature: loadAllParents(), then core
// array_shift()s off the current term — a page never appears in its
// own breadcrumb — so the walk starts at the parent.
function breadcrumb(int $tid, array $terms): array {
    $trail = [];
    $tid = $terms[$tid]['parent']; // skip the current term, like core
    while ($tid !== 0) {
        array_unshift($trail, $terms[$tid]['name']);
        $tid = $terms[$tid]['parent'];
    }
    array_unshift($trail, 'Home');
    return $trail;
}

$tid = 4; // visiting /taxonomy/term/4

echo "Page: /taxonomy/term/" . $tid . " — " . $terms[$tid]['name'] . "\\n";
echo "Breadcrumb: " . implode(' » ', breadcrumb($tid, $terms)) . "\\n\\n";

echo "Tagged content (core taxonomy_term view):\\n";
foreach ($nodes as $node) {
    if (in_array($tid, $node['field_topics'], true)) {
        echo "  - " . $node['title'] . "\\n";
    }
}

// The tags pattern: autocomplete widget + auto_create: true.
$input = 'Caching';
$match = array_search($input, array_column($terms, 'name'), true);
if ($match === false) {
    $newTid = max(array_keys($terms)) + 1;
    $terms[$newTid] = ['name' => $input, 'parent' => 0];
    echo "\\n'" . $input . "' not found — auto-created as term " . $newTid . "\\n";
}`,
    output: `Page: /taxonomy/term/4 — Drupal
Breadcrumb: Home » PHP » Frameworks

Tagged content (core taxonomy_term view):
  - Dependency Injection in Drupal

'Caching' not found — auto-created as term 5`,
  },

  keyPoints: [
    "A vocabulary is CONFIG (taxonomy.vocabulary.topics, exported by drush cex); its terms are CONTENT (DB-only, never exported).",
    "Terms are full entities: hierarchical (parent), drag-orderable (weight), and fieldable — you can put an image or color field on a term.",
    "Content attaches to terms via an entity reference field; the 'tags' pattern is the autocomplete tags widget plus auto_create: true in handler_settings.",
    "Core ships /taxonomy/term/{tid} as a real page — it's the views.view.taxonomy_term View, reshapeable in the UI — and taxonomy breadcrumbs follow the hierarchy for free.",
    "Terms = classification labels with light fields; if it needs a body, workflow, or its own designed page, make it a content type instead.",
    "Deploy trap: term IDs differ per environment. Seed shared terms with default_content or a migration, and reference them by UUID or name, never by tid.",
  ],

  interview: [
    {
      q: "In Drupal taxonomy, what is config and what is content, and what does that mean for deployments?",
      a: "The vocabulary — its name, machine name, description — is a config entity (`taxonomy.vocabulary.topics`) that `drush cex` exports to YAML and `drush cim` deploys like any other structure. The terms inside it are content entities: database rows created by editors, never exported with config. The practical consequence is that term IDs are auto-increment and differ across environments, so any View, block, or custom code that hardcodes a tid will break or silently mistarget on prod. Shared 'seed' terms should travel via a migration or the default_content module, which preserves UUIDs, and lookups should go by UUID or name.",
    },
    {
      q: "When would you model something as a taxonomy term versus a content type?",
      a: "Terms are classification labels: they exist mainly to categorize other content, they're hierarchical and orderable, and while they're fieldable you'd typically add only light fields like a description, image, or color. A content type is for rich standalone content — anything needing a body, editorial workflow and moderation, revisions, or its own designed page layout. A useful example: 'Region' as a filterable label is a term, but 'Office' with an address, staff list, and photo gallery is a content type. It's worth deciding early because converting terms to nodes later means migrating content and rewiring references.",
    },
    {
      q: "A Symfony dev estimates a week to build categories: entity, admin CRUD, landing pages, breadcrumbs, tagging UI. What does Drupal actually require?",
      a: "Minutes of clicking, not a week of code. Creating a vocabulary at Structure > Taxonomy gives the tree admin with drag-and-drop ordering and per-term forms immediately; an entity reference field on the content type provides the editor UI, and choosing the autocomplete tags widget with auto_create enabled gives type-to-create tagging with no JavaScript or endpoint. Core already serves `/taxonomy/term/{tid}` listing tagged content — it's the shipped `taxonomy_term` View, so restyling it is a Views UI edit — and the taxonomy module derives breadcrumbs from the hierarchy automatically. The only real 'work' left is exporting the vocabulary and field config with `drush cex` and planning how seed terms move between environments.",
    },
    {
      q: "How does the 'tags' autocomplete create new terms, and where is that behavior configured?",
      a: "It's pure field configuration, not code. The field is an entity reference with `target_type: taxonomy_term`; in the field's settings the handler is `default:taxonomy_term` with `handler_settings.auto_create: true` and one or more `target_bundles`, and the form display uses the `entity_reference_autocomplete_tags` widget. When an editor types a value that doesn't match an existing term, Drupal creates the term in the target vocabulary during save and references it. That's exactly how the standard profile's `field_tags` on Article works, and the whole behavior lives in the exported `field.field.node.article.field_tags.yml`.",
    },
  ],

  quiz: [
    {
      question:
        "You run drush cex after building a 'Topics' vocabulary with 30 terms. What lands in config/sync?",
      options: [
        "The vocabulary definition and all 30 terms",
        "Only taxonomy.vocabulary.topics.yml — the terms are content and are not exported",
        "Only the terms, since the vocabulary is generated automatically",
        "Nothing — taxonomy is entirely content",
      ],
      answerIndex: 1,
      explain:
        "The vocabulary is a config entity, so its definition exports to YAML. The terms are content entities: they live only in the database, are skipped by cex, and their auto-increment IDs will differ across environments — seed them with default_content or a migration.",
    },
    {
      question:
        "What configuration produces the 'type a new tag and it gets created' behavior on a node form?",
      options: [
        "A custom JavaScript autocomplete calling a controller endpoint",
        "A text field with a validation hook that inserts terms",
        "An entity reference field with auto_create: true in its handler settings plus the Autocomplete (Tags style) widget",
        "Enabling the 'Free tagging' core module",
      ],
      answerIndex: 2,
      explain:
        "The tags pattern is pure field config: an entity_reference field targeting taxonomy_term with handler_settings.auto_create: true, rendered with the entity_reference_autocomplete_tags widget. Unknown input becomes a new term in the target vocabulary on save — no code involved.",
    },
    {
      question:
        "The page at /taxonomy/term/12 listing all tagged content is best described as:",
      options: [
        "A hardcoded controller in the taxonomy module you must override in PHP",
        "A core View (views.view.taxonomy_term) you can reshape in the Views UI",
        "A page that only exists after you build a View yourself",
        "A static alias created by Pathauto",
      ],
      answerIndex: 1,
      explain:
        "Core ships views.view.taxonomy_term with a page display at taxonomy/term/% — that's why every term has a landing page for free. Because it's an ordinary View, you change its style, filters, or pager in the UI; Pathauto only prettifies the URL (e.g. /topics/php).",
    },
    {
      question:
        "Your dev-built View filters by 'Topics term tid 7 (News)'. After deploying config to prod, the block shows wrong content. Why?",
      options: [
        "Views cannot filter by taxonomy terms across environments",
        "drush cim deleted the term",
        "The vocabulary machine name changed during import",
        "Term IDs are per-environment auto-increments — tid 7 on prod is a different term (or missing)",
      ],
      answerIndex: 3,
      explain:
        "Terms are content, so they were created independently on each environment and got different auto-increment IDs. Config that hardcodes a tid mistargets after deploy. Fix by seeding terms with stable UUIDs (default_content or a migration) or filtering in ways that don't pin a raw tid.",
    },
  ],
};

export default lesson;
