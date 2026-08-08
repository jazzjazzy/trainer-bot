import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "views-fields-filters-sorts",
  title: "Views Deep-Dive: Fields, Filters, Sorts & Pagers",
  part: "Views: Queries Without Code",
  estMinutes: 13,
  summary:
    "Work the Views edit UI like a QueryBuilder: Fields are your SELECT, Filter criteria your WHERE, Sort criteria your ORDER BY, and the Pager your LIMIT/OFFSET plus rendered pagination.",

  concept: `
## The edit page is a query builder form

Open any view at \`/admin/structure/views/view/news\` and read the middle column
top to bottom. It maps one-to-one onto the Doctrine QueryBuilder you would have
written:

- **Fields** ~ \`->select(...)\` — which columns come back and how each renders
- **Filter criteria** ~ \`->andWhere(...)\` — conditions with operators
- **Sort criteria** ~ \`->orderBy()->addOrderBy()\` — multiple, ordered
- **Pager** ~ \`->setMaxResults()\` / \`->setFirstResult()\` *plus* the paginator UI

Every change you make here lands in the view's config entity
(\`views.view.news.yml\`) when you export — the whole "query" is data.

## Fields: SELECT plus per-column rendering

Click **Add** next to Fields and you can pull in any field on the base entity
(and, later, on related entities). Each field then has its own settings form:
a **label** (or none), a **formatter** with settings (link title to content,
date format, image style, trim length), and two power features:

- **Exclude from display** — fetch the field but don't render it. That's a
  column you select only to use elsewhere, like a hidden join column.
- **Rewrite results** — "Override the output of this field with custom text"
  gives you an inline template. Any field placed *above* this one in the list
  is available as a Twig-style token, so a rewrite box containing
  \`<h3>{{ title }}</h3> by {{ uid }}\` is a tiny per-row template — no Twig
  file authored, no theme touched.

## Filter criteria: WHERE with an operator dropdown

Add **Content: Published = Yes** and **Content: Content type = Article** and
you've written \`status = 1 AND type = 'article'\`. Every filter exposes an
operator suited to its type — strings get *contains / starts with / is equal
to*, numbers get *between / greater than*, dates get relative offsets. (Whether
a filter is *exposed* to visitors is a later lesson; today's filters are baked
into the query.)

## Sort criteria and the Pager

Sorts stack: **Authored on (desc)** then **Title (asc)** is
\`ORDER BY created DESC, title ASC\`. The Pager is one dropdown replacing an
entire Symfony sub-project: **Full pager** (numbered links), **Mini** (just
prev/next), **Some** (fixed count, no links), or **All**. Items per page and
an **offset** (skip the first N — handy when a hero block already shows them)
are plain settings.

## Trust the preview

The live preview at the bottom re-runs on **Update preview**. Enable *Show the
SQL query* at \`/admin/structure/views/settings\` and it prints the actual SQL —
your feedback loop for "did my clicks build the query I meant?"

Two teasers before moving on: under **Advanced**, *Use aggregation* turns
fields into COUNT/SUM with GROUP BY semantics, and *Caching* is set per
display (tag-based by default) — both get their own attention later.
`,

  comparisons: [
    {
      label: "Fields = the SELECT clause (with rendering attached)",
      intro:
        "Pick which columns a news listing returns and how each one renders. Doctrine selects scalars and defers formatting to Twig; Views attaches label, formatter, and settings to each field right in the query definition.",
      php: `// Doctrine: choose columns, format later in Twig.
$qb = $repo->createQueryBuilder('a')
    ->select('a.title', 'a.createdAt');
// Date format, linking the title, trimming — all of
// that lives in the template, per call site:
//   {{ a.createdAt|date('M j, Y') }}`,
      ts: `# Views UI: /admin/structure/views/view/news
# Fields > Add > check "Content: Title",
#   "Content: Authored on" > apply, then configure each.
# Exported into views.view.news.yml (display_options):
fields:
  title:
    id: title
    table: node_field_data
    field: title
    plugin_id: field
    label: ''
    exclude: false
    settings:
      link_to_entity: true
  created:
    id: created
    table: node_field_data
    field: created
    plugin_id: field
    label: 'Posted'
    type: timestamp
    settings:
      date_format: medium`,
      note:
        "In Views the formatter travels WITH the field in config — the date format and title link are part of the exported query, not scattered across templates.",
    },
    {
      label: "Filter criteria = WHERE with operators",
      intro:
        "Only published articles whose title contains 'drupal'. Each Views filter is a condition plus an operator dropdown matched to the field type.",
      php: `$qb->andWhere('a.published = :pub')
   ->andWhere('a.type = :type')
   ->andWhere('a.title LIKE :needle')
   ->setParameter('pub', true)
   ->setParameter('type', 'article')
   ->setParameter('needle', '%drupal%');`,
      ts: `# Filter criteria > Add > "Content: Published",
#   "Content: Content type", "Content: Title".
# The Title filter's operator dropdown offers:
#   Is equal to / Contains / Starts with / ...
filters:
  status:
    id: status
    table: node_field_data
    field: status
    plugin_id: boolean
    value: '1'
  type:
    id: type
    table: node_field_data
    field: type
    plugin_id: bundle
    value:
      article: article
  title:
    id: title
    table: node_field_data
    field: title
    plugin_id: string
    operator: contains
    value: drupal`,
      note:
        "operator: contains becomes LIKE '%drupal%' in the generated SQL — check it yourself with 'Show the SQL query' enabled in the preview.",
    },
    {
      label: "Sorts + pager = orderBy + an entire paginator, free",
      intro:
        "Newest first, title as tie-breaker, 10 per page with numbered page links. In Symfony the links alone mean pulling in a paginator bundle.",
      php: `$qb->orderBy('a.createdAt', 'DESC')
   ->addOrderBy('a.title', 'ASC')
   ->setFirstResult(($page - 1) * 10)
   ->setMaxResults(10);
// Then: KnpPaginatorBundle (or hand-rolled page
// links), a ?page= route param, Twig markup...`,
      ts: `# Sort criteria > Add > "Content: Authored on"
#   (Sort descending), then "Content: Title" (asc).
#   Drag to reorder — order is the tie-break order.
# Pager > "Paged output, full pager", 10 per page.
sorts:
  created:
    id: created
    table: node_field_data
    field: created
    order: DESC
    plugin_id: date
  title:
    id: title
    table: node_field_data
    field: title
    order: ASC
pager:
  type: full
  options:
    items_per_page: 10
    offset: 0`,
      note:
        "pager.type is full | mini | some | none. 'some' = setMaxResults with no links; offset skips rows already shown elsewhere (e.g. a hero block).",
    },
    {
      label: "Rewrite results = an inline row template with tokens",
      intro:
        "Custom per-row markup combining several fields. Instead of a Twig template, rewrite ONE field's output using the other fields as tokens — and exclude the raw source fields from display.",
      php: `// Symfony: per-row markup means a Twig template
// (or string-building in PHP):
foreach ($articles as $a) {
    $rows[] = sprintf(
        '<h3>%s</h3><span class="byline">by %s</span>',
        htmlspecialchars($a->getTitle()),
        htmlspecialchars($a->getAuthor()->getName()),
    );
}`,
      ts: `# On the Title field: Rewrite results >
#   "Override the output of this field with custom text".
# Tokens = fields listed ABOVE this one, Twig syntax.
# The raw author field is fetched but hidden:
fields:
  uid:
    id: uid
    field: uid
    exclude: true            # select it, don't render it
  title:
    id: title
    field: title
    alter:
      alter_text: true
      text: '<h3>{{ title }}</h3><span class="byline">by {{ uid }}</span>'`,
      note:
        "Token order matters: a field can only use tokens for fields placed above it. 'Exclude from display' + rewrite is the idiomatic combo for composite rows.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Simulate the Views preview panel: turn a display's config (fields, filters with operators, sorts, pager) into the SQL it would show, then apply a rewrite template to one row. Predict the query before you run.",
    code: `<?php
// The Views edit page IS a query builder UI. Each section of the form
// is one clause. Simulate how the preview panel turns display config
// (what your clicks produce) into the SQL it shows you.

$display = [
  'fields'  => ['title', 'created', 'uid'],
  'filters' => [
    ['field' => 'status', 'op' => '=',        'value' => '1'],
    ['field' => 'type',   'op' => 'IN',       'value' => "('article')"],
    ['field' => 'title',  'op' => 'contains', 'value' => 'drupal'],
  ],
  'sorts'   => [
    ['field' => 'created', 'order' => 'DESC'],
    ['field' => 'title',   'order' => 'ASC'],
  ],
  'pager'   => ['type' => 'mini', 'items_per_page' => 5, 'offset' => 10],
];

// FIELDS section ~ SELECT
$select = implode(', ', $display['fields']);

// FILTER CRITERIA ~ WHERE (each operator maps to SQL)
$where = [];
foreach ($display['filters'] as $f) {
  $where[] = $f['op'] === 'contains'
    ? $f['field'] . " LIKE '%" . $f['value'] . "%'"
    : $f['field'] . ' ' . $f['op'] . ' ' . $f['value'];
}

// SORT CRITERIA ~ ORDER BY (multiple, applied in listed order)
$order = [];
foreach ($display['sorts'] as $s) {
  $order[] = $s['field'] . ' ' . $s['order'];
}

echo "SELECT " . $select . "\\n";
echo "FROM node_field_data\\n";
echo "WHERE " . implode("\\n  AND ", $where) . "\\n";
echo "ORDER BY " . implode(', ', $order) . "\\n";

// PAGER ~ LIMIT / OFFSET ('none' would drop the clause entirely)
$p = $display['pager'];
if ($p['type'] !== 'none') {
  echo "LIMIT " . $p['items_per_page'] . " OFFSET " . $p['offset'] . "\\n";
}
echo "[pager: " . $p['type'] . "]\\n\\n";

// REWRITE RESULTS ~ per-row token replacement, exactly like the
// "Override the output of this field with custom text" box.
$rewrite = '<h3>{{ title }}</h3> <em>posted {{ created }}</em>';
$row = ['{{ title }}' => 'Decoupled Drupal', '{{ created }}' => 'Aug 1, 2026'];
echo strtr($rewrite, $row) . "\\n";`,
    output: `SELECT title, created, uid
FROM node_field_data
WHERE status = 1
  AND type IN ('article')
  AND title LIKE '%drupal%'
ORDER BY created DESC, title ASC
LIMIT 5 OFFSET 10
[pager: mini]

<h3>Decoupled Drupal</h3> <em>posted Aug 1, 2026</em>`,
  },

  keyPoints: [
    "Read the Views edit page as a QueryBuilder: Fields ~ select(), Filter criteria ~ andWhere(), Sort criteria ~ orderBy()/addOrderBy(), Pager ~ setMaxResults()/setFirstResult() plus rendered page links.",
    "Every field carries its own label, formatter, and settings in config — rendering decisions live in the exported views.view.*.yml, not in templates you author.",
    "'Exclude from display' fetches a field without rendering it; 'Rewrite results' turns a field into an inline template using Twig-style tokens of the fields listed above it.",
    "Filters get type-appropriate operators (contains, starts with, between, relative dates); operator + value export as plain YAML keys like operator: contains.",
    "Pager types are full, mini, some (fixed count, no links), and none (all); items per page and offset are settings, and the pager markup is rendered for free.",
    "Use the live preview with 'Show the SQL query' (enable at /admin/structure/views/settings) as your feedback loop; aggregation (COUNT/GROUP BY) and per-display caching live under Advanced.",
  ],

  interview: [
    {
      q: "Walk me through how the sections of the Views edit UI map onto a query you'd write by hand.",
      a: "The middle column of the Views edit page is a visual QueryBuilder. **Fields** is the SELECT clause — each added field also carries its label and formatter settings, so rendering is part of the definition. **Filter criteria** is the WHERE clause, with an operator dropdown per filter (equals, contains, between, relative dates). **Sort criteria** is ORDER BY and supports multiple sorts applied in listed order, and the **Pager** covers LIMIT/OFFSET plus the actual pagination markup — full, mini, a fixed number, or all items, with items-per-page and offset settings. All of it exports into one `views.view.*.yml` config entity, so the entire 'query' is reviewable, diffable data rather than PHP.",
    },
    {
      q: "How would you build a listing row with custom combined markup — say title plus author byline — without writing a template?",
      a: "Use **Rewrite results** on a field. Add all the source fields to the view first, mark the ones you only need as raw data with **Exclude from display**, then on the field that should render, enable 'Override the output of this field with custom text' and write inline markup using Twig-style tokens like `{{ title }}` and `{{ uid }}`. The one gotcha is ordering: a field can only use tokens for fields placed above it in the Fields list. This covers a lot of light templating; once markup gets genuinely complex, that's the boundary where a Twig template override becomes the right call.",
    },
    {
      q: "How do you verify that the view you clicked together runs the query you intended?",
      a: "Use the live preview at the bottom of the edit page — it re-runs the display against real data on 'Update preview'. For the query itself, enable **Show the SQL query** (and optionally performance statistics) at `/admin/structure/views/settings`; the preview then prints the exact generated SQL, so you can confirm your filter operators became the right LIKE/IN conditions and your sorts and pager produced the expected ORDER BY and LIMIT/OFFSET. It's the same feedback loop as dumping DQL from a QueryBuilder, but built into the UI. That habit catches most mistakes before the view ever ships as config.",
    },
    {
      q: "Where do aggregation and caching fit into a view, coming from someone who'd write GROUP BY and cache layers in code?",
      a: "Both live under the **Advanced** column of the edit page. Toggling **Use aggregation** on lets each field, filter, and sort take an aggregation function — COUNT, SUM, MIN/MAX — with Views adding the GROUP BY semantics, so 'number of articles per author' needs no custom query. **Caching** is configured per display: tag-based caching is the default (results invalidate automatically when the underlying entities change), with time-based and none as alternatives. That per-display setting is a small window into Drupal's wider cache-tag system, which merits its own study for anyone running high-traffic listings.",
    },
  ],

  quiz: [
    {
      question:
        "You add an 'Authored by' field only so its value can be used inside another field's rewritten output. What two settings make this work cleanly?",
      options: [
        "Enable aggregation on the field and set the pager to 'some'",
        "Check 'Exclude from display' on it, and place it ABOVE the field whose rewrite uses its token",
        "Set its operator to 'contains' and give it an offset",
        "Move it to Filter criteria and expose it",
      ],
      answerIndex: 1,
      explain:
        "'Exclude from display' fetches the field without rendering it, and rewrite tokens are only available for fields listed above the field being rewritten — so the token source must sit higher in the Fields list.",
    },
    {
      question:
        "Which Views section corresponds to Doctrine's ->andWhere() calls?",
      options: [
        "Fields",
        "Sort criteria",
        "Filter criteria",
        "The Pager",
      ],
      answerIndex: 2,
      explain:
        "Filter criteria build the WHERE clause; each filter contributes one condition with an operator suited to its type (contains for strings, between for numbers, relative offsets for dates). Fields map to SELECT, Sort criteria to ORDER BY, and the Pager to LIMIT/OFFSET.",
    },
    {
      question:
        "A hero block already displays the 3 newest articles, and the listing below it must show the NEXT 10 with numbered page links. Which pager setup is right?",
      options: [
        "Type 'some', items per page 10, offset 3",
        "Type 'full', items per page 10, offset 3",
        "Type 'mini', items per page 3, offset 10",
        "Type 'none' with a filter on created date",
      ],
      answerIndex: 1,
      explain:
        "'Full' renders numbered page links, items per page 10 is the LIMIT, and offset 3 skips the rows the hero block already shows. 'Some' would cap the count but render no links, and 'mini' only gives previous/next.",
    },
    {
      question:
        "Where do you turn on the setting that makes the Views preview show the generated SQL?",
      options: [
        "In each field's Rewrite results section",
        "Under Advanced > Use aggregation on the view",
        "At /admin/structure/views/settings ('Show the SQL query')",
        "In settings.php via a $config override",
      ],
      answerIndex: 2,
      explain:
        "'Show the SQL query' is a global Views UI setting at /admin/structure/views/settings. Once enabled, every view's preview panel prints the actual SQL it runs — the fastest way to confirm your clicks built the query you intended.",
    },
  ],
};

export default lesson;
