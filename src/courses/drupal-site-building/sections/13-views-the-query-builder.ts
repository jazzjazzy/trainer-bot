import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "views-the-query-builder",
  title: "Views: The Query Builder That Replaces Your Controllers",
  part: "Views: Queries Without Code",
  estMinutes: 12,

  summary:
    "A View is a saved, configurable query plus display pipeline built at Structure > Views — one config entity that replaces the repository method, controller action, route, Twig template, and pagination wiring you would write in Symfony.",

  concept: `
## The most important tool in site building

Every listing feature in a Symfony app costs you the same five artifacts: a
repository method, a controller action, a route definition, a Twig template,
and pagination wiring. In Drupal, all five collapse into one **View** — a
saved, configurable query plus a display pipeline, assembled entirely in the
admin UI at **Structure > Views** (\`/admin/structure/views\`). Views has been
**in core since Drupal 8**. It is not a nice-to-have contrib module: it IS how
listing pages are built. The \`/admin/content\` screen, the front page river,
the user admin list — all Views. Hand-coding a listing controller in Drupal is
the anti-pattern.

### Anatomy of a View

Every View is the same set of parts, each editable through the UI:

- **Base table** — what you query: Content (\`node_field_data\`), Users,
  Taxonomy terms, Media, Files. Chosen once when the View is created.
- **Displays** — where results appear. A **Page** display gets a real route
  from its Path setting; a **Block** display becomes placeable in any theme
  region; there are also Feed, Attachment, and Embed displays. One View can
  carry several displays that share one query, with per-display overrides.
- **Format** — how rows are wrapped (Table, Grid, HTML list, Unformatted
  list) and what each row is: the rendered entity in a view mode (e.g.
  Teaser), or a hand-picked set of **Fields**.
- **Filter criteria** — the WHERE clause: Published = Yes, Type = Article.
- **Sort criteria** — the ORDER BY.
- **Pager** — full pager, mini pager, a fixed number of items, or all items.

### Wizard first, then the real UI

**Add view** starts a wizard: name it, pick "Show Content of type Article
sorted by Newest first", tick **Create a page** (title, path, display format,
items per page, pager) and/or **Create a block**. The wizard is scaffolding —
**Save and edit** drops you into the real Views UI: three columns holding all
the parts above, a live preview underneath, and (with "Show the SQL query"
enabled at Structure > Views > Settings) the exact SELECT it will run. You are
editing a query the way an editor edits a node.

### One config entity, not five files

Saving produces a **config entity** named \`views.view.recent_articles\`.
\`drush config:export\` writes it to
\`config/sync/views.view.recent_articles.yml\` — route, query, pager, and
"template" choices in one reviewable, diffable YAML file that deploys with
\`drush config:import\`. When the client asks for 20 items instead of 10, that
is a two-click config change plus an export, not a code release.

### When would you still write a controller?

Only when the output genuinely is not a listing of entities — a dashboard
computing derived numbers, a one-off integration endpoint. Even then, check
the coming sections first: exposed filters, relationships, contextual filters,
and REST exports cover far more ground than you expect. The reflex to write
\`ArticleController::list()\` is exactly the habit this course exists to break.
`,

  comparisons: [
    {
      label: "One View replaces the whole listing stack",
      intro:
        "A paginated /articles page of published articles, newest first. On the left, the five artifacts a Symfony developer writes; on the right, the wizard clicks and the single config file they produce.",
      php: `<?php
// The Symfony reflex: five artifacts for one listing page.

// 1) src/Repository/ArticleRepository.php
public function findPublished(int $page, int $perPage = 10): array
{
    return $this->createQueryBuilder('a')
        ->andWhere('a.published = true')
        ->orderBy('a.createdAt', 'DESC')
        ->setFirstResult($page * $perPage)
        ->setMaxResults($perPage)
        ->getQuery()
        ->getResult();
}

// 2) src/Controller/ArticleController.php
#[Route('/articles', name: 'article_list')]  // 3) the route
public function list(ArticleRepository $repo, Request $request): Response
{
    $page = $request->query->getInt('page', 0);
    return $this->render('article/list.html.twig', [  // 4) template
        'articles' => $repo->findPublished($page),    // 5) pager wiring
    ]);
}`,
      ts: `# Structure > Views > Add view
#   View name: Recent articles
#   Show: Content, of type: Article, sorted by: Newest first
#   [x] Create a page — Path: /articles
#       Display format: Unformatted list of teasers
#       Items to display: 10, [x] Use a pager
# Save and edit, then: drush cex
# -> config/sync/views.view.recent_articles.yml (excerpt)
id: recent_articles
label: 'Recent articles'
base_table: node_field_data
base_field: nid
display:
  default:
    display_plugin: default
    display_options:
      filters:
        status:
          table: node_field_data
          field: status
          value: '1'
          plugin_id: boolean
        type:
          table: node_field_data
          field: type
          value:
            article: article
          plugin_id: bundle
      sorts:
        created:
          table: node_field_data
          field: created
          order: DESC
          plugin_id: date
      pager:
        type: mini
        options:
          items_per_page: 10
      row:
        type: 'entity:node'
        options:
          view_mode: teaser
  page_1:
    display_plugin: page
    display_options:
      path: articles`,
      note:
        "The page_1 display's path key IS the route; filters/sorts are the query; row.view_mode is the 'template'. One exportable YAML file replaces the repository, controller, route, template, and pager code.",
    },
    {
      label: "Pagination: hand wiring vs a pager plugin",
      intro:
        "Real pagination needs a COUNT query, offset math, and page-link rendering. In Views that whole stack is one dropdown in the PAGER section.",
      php: `<?php
// Pagination by hand: COUNT query, offset math, page-link data.
$perPage = 10;
$page = max(1, $request->query->getInt('page', 1));

$total = (int) $repo->createQueryBuilder('a')
    ->select('COUNT(a.id)')
    ->andWhere('a.published = true')
    ->getQuery()
    ->getSingleScalarResult();

$articles = $repo->findPublished($page - 1, $perPage);

return $this->render('article/list.html.twig', [
    'articles' => $articles,
    'page'     => $page,
    'pages'    => (int) ceil($total / $perPage),
]);
// ...plus a Twig partial that renders the page links.`,
      ts: `# Views edit UI, middle column, PAGER section:
#   Use pager: Full  (or: Mini | Some — fixed number | Display all)
#   Items per page: 10, Offset: 0
# Views issues the COUNT query, reads ?page= from the URL,
# and renders the pager links. Exported, it is four lines:
pager:
  type: full
  options:
    items_per_page: 10
    offset: 0`,
      note:
        "type: full renders numbered links, mini renders prev/next (skipping the expensive COUNT), some outputs a fixed number with no links, none shows everything. Swapping pager style later is a dropdown change, not a refactor.",
    },
    {
      label: "The 'template': Format + Fields instead of Twig",
      intro:
        "A sortable table of title, author, and date. In Symfony you own this markup forever; in Views it is the Format section — Table with field rows — and the theme renders it.",
      php: `{# templates/article/list.html.twig — markup you own forever #}
<table class="articles">
  <thead>
    <tr><th>Title</th><th>Author</th><th>Published</th></tr>
  </thead>
  <tbody>
  {% for article in articles %}
    <tr>
      <td><a href="{{ path('article_show', {id: article.id}) }}">
        {{ article.title }}</a></td>
      <td>{{ article.author.name }}</td>
      <td>{{ article.createdAt|date('Y-m-d') }}</td>
    </tr>
  {% endfor %}
  </tbody>
</table>`,
      ts: `# FORMAT section in the Views UI:
#   Format: Table (settings: sortable columns, sticky header)
#   Show: Fields — add Title (link to content), Authored by,
#         Authored on (custom date format: Y-m-d)
# The exported style/row/fields sections replace the template:
style:
  type: table
  options:
    sticky: true
row:
  type: fields
fields:
  title:
    table: node_field_data
    field: title
    plugin_id: field
    settings:
      link_to_entity: true
  uid:
    table: node_field_data
    field: uid
    plugin_id: field
  created:
    table: node_field_data
    field: created
    plugin_id: field
    type: timestamp
    settings:
      date_format: custom
      custom_date_format: 'Y-m-d'`,
      note:
        "Table format gives you click-to-sort column headers for free — code you would never bother writing by hand. Switching Table to Grid or HTML list later touches zero templates.",
      leftLang: "php",
      rightLang: "yaml",
    },
    {
      label: "Shipping a change to the 'query'",
      intro:
        "The client wants 20 items per page instead of 10. Compare what changes in each stack — and notice both still go through git review.",
      php: `# Symfony: the listing lives in code — every tweak is a release
git checkout -b feature/articles-per-page
# edit ArticleController.php / the repository: 10 -> 20
git commit -am "Show 20 articles per page"
git push   # ...then CI, review, merge, deploy the PHP change`,
      ts: `# Drupal: change it in the UI, then export the config
drush config:export -y
#  [success] Configuration successfully exported to ../config/sync
git status --short
#  M config/sync/views.view.recent_articles.yml
git commit -am "Articles listing: 20 per page"

# on staging/production, after the config lands:
drush config:import -y && drush cache:rebuild`,
      note:
        "The change is still code-reviewed and deployed through git — but the diff is one readable YAML line (items_per_page: 10 -> 20) and no PHP changed. cim/cr on the target makes it live.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A model of the Views engine: the 'query' is pure config (like the exported YAML), and one generic pipeline runs it — filter, sort, page, pick fields. Predict the output, including what happens after the config-only edit at the end.",
    code: `<?php
// --- a View is saved config: decode it, run the pipeline ---
// This models what Views does with views.view.recent_articles.yml:
// filters -> WHERE, sorts -> ORDER BY, pager -> LIMIT, fields -> SELECT.

$config = [
    'base_table' => 'node_field_data',
    'filters' => [
        ['field' => 'status', 'value' => 1],
        ['field' => 'type',   'value' => 'article'],
    ],
    'sorts'  => [['field' => 'created', 'order' => 'DESC']],
    'pager'  => ['type' => 'full', 'items_per_page' => 2],
    'fields' => ['title', 'created'],
];

$nodes = [
    ['title' => 'Alpha',   'type' => 'article', 'status' => 1, 'created' => '2026-01-05'],
    ['title' => 'Beta',    'type' => 'page',    'status' => 1, 'created' => '2026-02-11'],
    ['title' => 'Gamma',   'type' => 'article', 'status' => 0, 'created' => '2026-03-19'],
    ['title' => 'Delta',   'type' => 'article', 'status' => 1, 'created' => '2026-04-02'],
    ['title' => 'Epsilon', 'type' => 'article', 'status' => 1, 'created' => '2026-05-27'],
];

function executeView(array $config, array $rows, int $page = 0): array {
    // Filter criteria -> WHERE
    foreach ($config['filters'] as $f) {
        $rows = array_values(array_filter(
            $rows, fn($r) => $r[$f['field']] == $f['value']
        ));
    }
    // Sort criteria -> ORDER BY
    foreach ($config['sorts'] as $s) {
        usort($rows, fn($a, $b) => $s['order'] === 'DESC'
            ? $b[$s['field']] <=> $a[$s['field']]
            : $a[$s['field']] <=> $b[$s['field']]);
    }
    // Pager -> COUNT + LIMIT/OFFSET
    $per = $config['pager']['items_per_page'];
    $pages = (int) ceil(count($rows) / $per);
    $rows = array_slice($rows, $page * $per, $per);
    // Fields -> the SELECT list the display shows
    $rows = array_map(
        fn($r) => array_intersect_key($r, array_flip($config['fields'])),
        $rows
    );
    return [$rows, $pages];
}

[$rows, $pages] = executeView($config, $nodes, 0);
echo "Page 1 of $pages\\n";
foreach ($rows as $r) {
    echo '- ' . $r['title'] . ' (' . $r['created'] . ")\\n";
}

[$rows] = executeView($config, $nodes, 1);
echo "Page 2 of $pages\\n";
foreach ($rows as $r) {
    echo '- ' . $r['title'] . ' (' . $r['created'] . ")\\n";
}

// A site builder bumps "Items per page" in the UI: ONLY config changes.
// The engine (this function) is untouched -- that is the whole lesson.
$config['pager']['items_per_page'] = 10;
[$rows, $pages] = executeView($config, $nodes, 0);
echo "After config edit: page 1 of $pages, " . count($rows) . " rows\\n";`,
    output: `Page 1 of 2
- Epsilon (2026-05-27)
- Delta (2026-04-02)
Page 2 of 2
- Alpha (2026-01-05)
After config edit: page 1 of 1, 3 rows`,
  },

  keyPoints: [
    "A View = a saved query + display pipeline: base table, displays, format, fields, filter criteria, sort criteria, pager — all built at **Structure > Views**.",
    "One View replaces five Symfony artifacts: repository method, controller action, route, Twig template, and pagination wiring.",
    "A **Page display's Path setting creates the route**; a Block display makes the same query placeable in theme regions — multiple displays share one query with per-display overrides.",
    "Views is **in core since Drupal 8** and is how listing pages are built — `/admin/content` itself is a View. Hand-coding a listing controller is the anti-pattern.",
    "Every View saves as the config entity `views.view.MACHINE_NAME`; `drush cex` writes it to a diffable YAML file in `config/sync/` that deploys with `drush cim`.",
    "The Add-view wizard only scaffolds; the real three-column edit UI (with live preview, and SQL display if enabled in Views settings) is where Views are actually built.",
  ],

  interview: [
    {
      q: "You're asked to build /articles: published articles, newest first, 10 per page. Walk me through the Drupal approach.",
      a: "I would not write a controller. Structure > Views > Add view; in the wizard: Show **Content** of type **Article** sorted by **Newest first**, tick **Create a page** with path `/articles`, format 'Unformatted list of teasers', 10 items, use a pager — then Save and edit to refine filters (Published = Yes is added for me), sorts, and the pager in the real UI. The Page display's path registers the route, Views handles the COUNT query and page links, and the teaser view mode is the 'template'. Finally `drush cex` exports it as `views.view.MACHINE_NAME.yml` so it's reviewable and deployable like any code change. In Symfony that's a repository method, controller, route, Twig template, and pagination wiring — here it's one config entity.",
    },
    {
      q: "What's the relationship between a View and its displays?",
      a: "A View holds one shared query definition — base table, filters, sorts — and any number of **displays** that put its results somewhere: a Page display (which gets a route from its Path setting), Block displays for theme regions, plus Feed, Attachment, and Embed. Each display inherits the default display's settings and can override any of them, e.g. the block shows 5 items with no pager while the page shows 25 with a full pager. That's the mental shift from Symfony, where reusing a query on a second surface means another controller action or an embedded controller call. In Views it's 'Add > Block' inside the same View, and it all still exports as one `views.view.*` YAML file.",
    },
    {
      q: "How does a View you built on your local machine get to production?",
      a: "A View is a **config entity**, not content, so it rides the standard config workflow: `drush config:export` writes `views.view.MACHINE_NAME.yml` into `config/sync/`, that file is committed and code-reviewed like PHP would be, and on production the deploy runs `drush config:import` plus a cache rebuild. Nothing is rebuilt by hand in the production UI, and there's no database dump involved. The interviewer is usually probing whether you understand the config/content split — the query definition is config and deploys; the articles it lists are content and stay in each environment's database.",
    },
    {
      q: "When is it acceptable to hand-code a listing page instead of using Views?",
      a: "Rarely — and saying 'almost never' is the right instinct in a Drupal interview. Views should be the default for any list of entities: it gives you access checking, caching, pagination, exposed filters, and an editable, exportable definition for free, and site builders can adjust it without you. Hand-code only when the output genuinely isn't an entity listing — a dashboard aggregating computed numbers, or data living outside the entity system — and even some of those cases can be handled with Views plugins. A developer who writes `ArticleController::list()` on a Drupal team is creating a listing nobody else can maintain.",
    },
  ],

  quiz: [
    {
      question:
        "What does the Path setting on a View's Page display actually do?",
      options: [
        "It only sets the breadcrumb; you still add the route to a routing.yml file",
        "It registers a real route at that URL — no routing file or controller is needed",
        "It creates a redirect from that path to a generated controller",
        "It sets the path alias pattern for nodes shown in the View",
      ],
      answerIndex: 1,
      explain:
        "A Page display's Path setting is the route. Views registers the URL, runs the query, and renders the result — the whole route + controller + template chain a Symfony dev would wire up by hand.",
    },
    {
      question: "After you save a View, where does its definition live?",
      options: [
        "As generated PHP classes in the modules directory",
        "Only in the database, so it can't be deployed between environments",
        "As a config entity (views.view.MACHINE_NAME) exportable to YAML with drush cex",
        "In the theme's templates folder as a Twig file",
      ],
      answerIndex: 2,
      explain:
        "A View is a config entity. It lives in active configuration and exports to config/sync/views.view.MACHINE_NAME.yml, so it is diffable in code review and deploys with drush config:import — the recurring click-to-config lesson of this course.",
    },
    {
      question:
        "A colleague says 'we need to install the Views contrib module first.' What's the correct response for Drupal 10/11?",
      options: [
        "Correct — Views has always been a contrib download",
        "Views has been in core since Drupal 8; on most sites it's already enabled and even /admin/content is a View",
        "Views was removed from core in Drupal 10 in favor of hand-coded controllers",
        "Views is core but only supports the Content base table",
      ],
      answerIndex: 1,
      explain:
        "Views (and Views UI) moved into core in Drupal 8 and core's own admin listings are built with it. It also supports multiple base tables — Content, Users, Taxonomy terms, Media, Files — not just nodes.",
    },
    {
      question:
        "Which part of a View determines whether you are listing content, users, media, or files?",
      options: [
        "The display format (table vs grid)",
        "The base table, chosen when the View is created",
        "The pager type",
        "The filter criteria",
      ],
      answerIndex: 1,
      explain:
        "The base table (e.g. node_field_data for Content, users_field_data for Users) is what the View queries, and it's picked once in the Add-view wizard. Filters, sorts, fields, and formats all hang off that choice.",
    },
  ],
};

export default lesson;
