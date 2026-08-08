import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "views-rest-export",
  title: "Views REST Export: Instant JSON Endpoints",
  part: "Views: Queries Without Code",
  estMinutes: 12,
  summary:
    "Add a REST export display to any view and its query becomes a read-only JSON (or XML) endpoint — path, key aliases, pagination, and query-param filters included — replacing a Symfony API controller plus serializer groups.",

  concept: `
## The display that replaces your API controller

Your news view already has a page display rendering HTML. The mobile team now
wants the same list as JSON. The Symfony reflex: a \`/api/articles\` route, a
controller, serializer groups, pagination params, input validation. The Drupal
move: add **one more display** to the view you already built.

Two core modules must be on first: **RESTful Web Services** (\`rest\`) and
**Serialization** (\`serialization\`) — \`drush pm:enable rest\` pulls in the
second as a dependency. After a cache rebuild, the view edit page's **Add**
button offers **REST export**. Give it a path like \`api/articles\`, save, and
the endpoint exists. Same Fields, Filter criteria, and Sorts as the page
display (override any of them per display) — one query, two outputs.

### Format and row style

A REST export's Format is locked to **Serializer**; its settings are checkboxes
for the accepted formats, \`json\` and \`xml\`. Check only json and the path
returns JSON; check both and clients choose with \`?_format=xml\`.

The row style is the real design decision:

- **Entity** (\`data_entity\`) — serializes the full normalized entity:
  every field, in Drupal's nested \`value\` arrays. Fast to set up, but it
  leaks your whole field list and the shape is very Drupal.
- **Fields** (\`data_field\`) — the curated option, your serializer-groups
  moment. Only fields added to the view appear, and the row settings give each
  one an **Alias** (the exact JSON key you expose) and a **Raw output**
  checkbox (skip the formatter, emit the stored value — no link markup around
  titles, timestamps instead of formatted dates).

### Pagination and filtering come free

The display's pager applies unchanged: clients page with \`?page=1\`
(0-indexed, like every Views pager). Any **exposed filter** becomes a query
parameter named by its identifier — \`?title=drupal&field_tags_target_id=12\` —
operators and all. Exposed sorts work too (\`?sort_by=created&sort_order=ASC\`).
You clicked together a filterable, paginated API without parsing a single
request parameter.

### Access still applies

This is not an open door. The view's **Access** setting (permission or role)
gates the route — anonymous consumers need a check they can pass, such as the
*View published content* permission. The display also has an
**Authentication** setting listing enabled providers (\`cookie\` in core;
\`basic_auth\` once that module is on). And your baked-in filters still count:
keep **Published = Yes** and drafts never leave the server. Responses carry
cache tags, so they invalidate when content changes.

### When to reach for JSON:API instead

Core also ships **JSON:API**: enable the module and every entity type is
exposed at standardized paths like \`/jsonapi/node/article\`, relationships
included — no per-endpoint setup. One caveat: it ships **read-only** by
default (\`jsonapi.settings: read_only: true\`), so POST/PATCH/DELETE return
405 until you select *Accept all JSON:API create, read, update, and delete
operations* at \`/admin/config/services/jsonapi\` — that one switch unlocks
full CRUD. It's the default for a fully decoupled front end, and a topic for
its own study. The rule of thumb:
"give me a read-only feed shaped exactly like *this*" is a Views REST export;
"let an app read and write entities generically" is JSON:API.
`,

  comparisons: [
    {
      label: "A listing endpoint: route + controller → one added display",
      intro:
        "Expose the ten newest published articles as JSON at /api/articles. Symfony means a controller and serializer call; Drupal means adding a REST export display to the existing news view.",
      php: `#[Route('/api/articles', methods: ['GET'])]
public function list(ArticleRepository $repo): JsonResponse
{
    $articles = $repo->findBy(
        ['published' => true],
        ['createdAt' => 'DESC'],
        10,
    );

    return $this->json($articles, 200, [], [
        'groups' => ['article:list'],
    ]);
}`,
      ts: `# Prereq: drush pm:enable rest   (adds serialization too)
# /admin/structure/views/view/news > Add > REST export
#   > Path: api/articles
#   > Format: Serializer > Settings > check "json". Save.
# Exported into views.view.news.yml:
display:
  rest_export_1:
    id: rest_export_1
    display_title: 'REST export'
    display_plugin: rest_export
    position: 2
    display_options:
      path: api/articles
      style:
        type: serializer
        options:
          formats:
            json: json`,
      note:
        "Same view, new display: the page display keeps rendering HTML while rest_export_1 serves JSON from the identical query. Check xml as well and clients pick a format with ?_format=xml.",
    },
    {
      label: "Serializer groups → row style Fields with aliases",
      intro:
        "Control exactly which keys the JSON exposes. Symfony annotates the entity with groups and serialized names; the REST export's Fields row style aliases each Views field and can emit raw values.",
      php: `use Symfony\\Component\\Serializer\\Attribute\\Groups;
use Symfony\\Component\\Serializer\\Attribute\\SerializedName;

class Article
{
    #[Groups(['article:list'])]
    #[SerializedName('headline')]
    private string $title;

    #[Groups(['article:list'])]
    #[SerializedName('published_at')]
    private \\DateTimeImmutable $createdAt;

    // Not in the group => never serialized in this feed.
    private string $internalNotes;
}`,
      ts: `# On the REST export display: Format > Show: Fields.
# Then Settings on the row style lists every field with
# an Alias box and a Raw output checkbox:
#   title   > Alias: headline
#   created > Alias: published_at, Raw output: on
row:
  type: data_field
  options:
    field_options:
      title:
        alias: headline
        raw_output: false
      created:
        alias: published_at
        raw_output: true`,
      note:
        "The Entity row (type: data_entity) dumps the whole normalized entity as nested value arrays. Fields (data_field) is the curated contract: only added fields leave the server, under exactly the keys you alias.",
    },
    {
      label: "Pagination + query-param filters for free",
      intro:
        "Consumers want ?page= plus a title search. In Symfony you parse and validate the query string yourself; in Views the pager and an exposed filter ARE the query-string API.",
      php: `public function list(
    Request $request,
    ArticleRepository $repo,
): JsonResponse {
    $page = max(0, $request->query->getInt('page'));
    $q = $request->query->getString('title');

    $qb = $repo->createQueryBuilder('a')
        ->andWhere('a.title LIKE :q')
        ->setParameter('q', '%' . $q . '%')
        ->setFirstResult($page * 10)
        ->setMaxResults(10);
    // ...then serialize, and build prev/next
    // links yourself.
}`,
      ts: `# Pager: "Paged output, full pager", 10 per page
#   -> clients page with  GET /api/articles?page=1
#      (0-indexed, like every Views pager)
# Filter criteria > Title > Expose this filter
#   -> its identifier becomes the query param:
#      GET /api/articles?title=drupal&page=0
pager:
  type: full
  options:
    items_per_page: 10
filters:
  title:
    id: title
    table: node_field_data
    field: title
    plugin_id: string
    operator: contains
    exposed: true
    expose:
      identifier: title`,
      note:
        "Every exposed filter is instantly an API query parameter, operator included — and exposed sorts add ?sort_by / ?sort_order. Zero request-parsing code.",
    },
    {
      label: "Locking it down and smoke-testing it",
      intro:
        "The endpoint must not be wide open. Symfony reaches for security attributes and firewall config; in Drupal the view's Access setting plus an Authentication provider gate the route.",
      php: `#[Route('/api/articles', methods: ['GET'])]
#[IsGranted('ROLE_API_USER')]
public function list(): JsonResponse
{
    // ...plus a firewall + authenticator in
    // security.yaml, and a JSON 401/403
    // error handler you write yourself.
}`,
      ts: `# Access is the view's Access setting (Permission / Role);
# anonymous needs a check it passes, e.g. "View published
# content". The display's Authentication setting lists
# providers (cookie; basic_auth once enabled) — exported
# as:  auth: [cookie]
drush pm:enable rest -y
drush cache:rebuild
# Format comes from ?_format — Drupal dropped Accept-header
# negotiation in 8.0, so an Accept header is ignored:
curl -s 'https://example.test/api/articles?page=0&_format=json'
# 403 JSON error while the access check fails;
# 200 + your aliased JSON array once it passes.`,
      rightLang: "bash",
      note:
        "Auth is configuration on the display, not middleware you write. Keep the Published filter baked in and drafts can never leak through the feed.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Simulate the REST export pipeline for GET /api/articles?title=drupal&page=1 — exposed filter, 0-indexed pager, Fields row style with aliases and raw output, then JSON serialization. Predict the exact body before you run.",
    code: `<?php
// A REST export display = the same Views query, serialized instead of
// themed. Simulate the pipeline for:
//   GET /api/articles?title=drupal&page=1

$request = ['title' => 'drupal', 'page' => 1];

$nodes = [
  1 => ['title' => 'Why Drupal Views beat hand-rolled SQL', 'created' => 1782864000],
  2 => ['title' => 'Composer for module updates',           'created' => 1783468800],
  3 => ['title' => 'Drupal config sync in CI',              'created' => 1784073600],
  4 => ['title' => 'Decoupled Drupal menus',                'created' => 1784678400],
  5 => ['title' => 'Twig debugging tricks',                 'created' => 1785283200],
];

// 1. Exposed filter (identifier: title, operator: contains) reads ?title=.
$matches = array_filter(
  $nodes,
  fn ($n) => stripos($n['title'], $request['title']) !== false,
);

// 2. Pager: 2 per page; ?page= is 0-indexed, like every Views pager.
$perPage = 2;
$pageRows = array_slice($matches, $request['page'] * $perPage, $perPage, true);

// 3. Row style "Fields": field_options are the contract of your API.
$field_options = [
  'title'   => ['alias' => 'headline',     'raw_output' => false],
  'created' => ['alias' => 'published_at', 'raw_output' => true],
  // No entry for a field = not in the display = never leaves the server.
];

// What a field FORMATTER would render (what the page display shows).
$formatter = fn (string $field, array $n, int $nid) => $field === 'created'
  ? date('M j, Y', $n['created'])
  : '<a href="/node/' . $nid . '">' . $n['title'] . '</a>';

$out = [];
foreach ($pageRows as $nid => $n) {
  $item = [];
  foreach ($field_options as $field => $opts) {
    // Raw output: skip the formatter, emit the stored value.
    $item[$opts['alias']] = $opts['raw_output']
      ? $n[$field]
      : $formatter($field, $n, $nid);
  }
  $out[] = $item;
}

// 4. Serialize ("json" checked under the style's accepted formats).
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\\n";`,
    output: `[
    {
        "headline": "<a href=\\"/node/4\\">Decoupled Drupal menus</a>",
        "published_at": 1784678400
    }
]`,
  },

  keyPoints: [
    "A REST export display turns any view into a read-only API endpoint: set a path, pick the Serializer format(s), save. It needs the core RESTful Web Services + Serialization modules (drush pm:enable rest).",
    "Format checkboxes are json and xml; with several checked, clients choose via ?_format=xml. The endpoint shares the underlying query with the view's other displays.",
    "Row style Entity (data_entity) serializes the full normalized entity; Fields (data_field) exposes only the fields you added, with a per-field Alias for the JSON key and Raw output to skip formatter markup.",
    "Pagination is the display's pager, consumed via 0-indexed ?page=; exposed filters (and exposed sorts) become query parameters named by their identifiers — a filterable API with zero request-parsing code.",
    "Access is still enforced: the view's Access setting gates the route, the Authentication setting picks providers (cookie, basic_auth), and baked-in filters like Published = Yes keep drafts out of the feed.",
    "Reach for core JSON:API when an app needs generic entity access — it ships read-only by default, and full CRUD is one setting away ('Accept all JSON:API create, read, update, and delete operations' at /admin/config/services/jsonapi); use a Views REST export for curated, read-only feeds shaped exactly how you want.",
  ],

  interview: [
    {
      q: "The mobile team needs a JSON feed of published articles. How do you ship it in Drupal without writing a controller?",
      a: "Enable the core **RESTful Web Services** and **Serialization** modules, then add a **REST export** display to the existing articles view. Set a path like `api/articles`, choose the Serializer format (check `json`), and pick a row style — Fields, usually, so I can alias each field to the exact JSON key the team wants. The display reuses the same Fields, Filter criteria, and Sorts as the page display, so the feed and the HTML listing can never drift apart. It exports as part of `views.view.*.yml`, so the whole endpoint is reviewable config and deploys through the normal config-sync workflow.",
    },
    {
      q: "On a REST export, when do you choose the Entity row style versus Fields, and where do serializer groups fit into that comparison?",
      a: "**Entity** serializes the complete normalized entity — every field, in Drupal's nested value-array shape. It's fine for internal tooling but it leaks the whole field list and couples consumers to Drupal's structure. **Fields** is the equivalent of Symfony serializer groups plus `#[SerializedName]`: only fields added to the view appear, each with an **Alias** that becomes the JSON key and a **Raw output** checkbox that skips the formatter (no anchor tags around titles, raw timestamps instead of formatted dates). For any feed with an external consumer I default to Fields, because the row settings *are* the API contract — and they live in exported config.",
    },
    {
      q: "How do pagination and filtering work for consumers of a Views REST endpoint?",
      a: "They come from the same Views machinery as the HTML display. The pager applies unchanged and clients request pages with `?page=1` — Views pages are 0-indexed. Any exposed filter becomes a query parameter named by its identifier, operator included, so `?title=drupal` runs the contains filter, and exposed sorts add `?sort_by` and `?sort_order`. In Symfony each of those is request-parsing and validation code in a controller; here it's the exposed-filter checkbox I'd already clicked for the HTML listing.",
    },
    {
      q: "Is a Views REST export secure by default, and how does it relate to JSON:API?",
      a: "It's exactly as secure as the view: the **Access** setting (permission or role) gates the route, so anonymous consumers need a check they can pass, like *View published content* — otherwise they get a 403. The display's **Authentication** setting selects providers such as cookie or basic_auth, and baked-in filters like Published = Yes keep unpublished content out at the query level; responses are cacheable with cache tags. **JSON:API** is the other core option: spec-compliant entity access at paths like `/jsonapi/node/article` with no per-endpoint setup — though it ships read-only (`read_only: true`), so writes 405 until you flip the one 'Accept all JSON:API create, read, update, and delete operations' setting at `/admin/config/services/jsonapi` — the right default for a decoupled front end. REST export wins when you want a curated, read-only feed shaped precisely for one consumer.",
    },
  ],

  quiz: [
    {
      question:
        "You open a view's Add-display menu but 'REST export' is not listed. What is missing?",
      options: [
        "The view must use a Fields row style first",
        "The core RESTful Web Services (+ Serialization) modules are not enabled",
        "A REST export can only be added to a brand-new view",
        "The JSON:API module must be enabled first",
      ],
      answerIndex: 1,
      explain:
        "The REST export display plugin ships with the core rest module, which depends on serialization. Enable them (drush pm:enable rest) and rebuild caches, and the option appears on every view. JSON:API is a separate, unrelated module.",
    },
    {
      question:
        "The API contract says each item must be exactly {\"headline\": ..., \"published_at\": ...} with no markup and no other data. Which setup delivers that?",
      options: [
        "Row style Entity, since it serializes everything consistently",
        "Row style Fields with only those two fields added, Alias set on each, and Raw output checked where markup would appear",
        "A rewrite-results template on the title field",
        "Check both json and xml under accepted formats",
      ],
      answerIndex: 1,
      explain:
        "The Fields (data_field) row style exposes only the fields added to the view; each field's Alias becomes its JSON key and Raw output skips formatter markup like the title's link. Entity would dump the full normalized entity — far more than the contract allows.",
    },
    {
      question:
        "A consumer calls GET /api/articles?title=drupal&page=1. What makes those parameters work?",
      options: [
        "Nothing extra — Views accepts arbitrary query parameters on any display",
        "A custom route with parameter converters",
        "An exposed Title filter (identifier 'title') plus the display's pager, whose pages are 0-indexed",
        "Enabling the JSON:API module's filter syntax",
      ],
      answerIndex: 2,
      explain:
        "Exposed filters become query parameters named by their identifiers, and the pager responds to ?page= starting at 0 — so page=1 is the second page. Both are settings on the display, not code.",
    },
    {
      question:
        "When is core JSON:API the better tool than a Views REST export?",
      options: [
        "When an app needs generic entity access with full CRUD and standardized relationships",
        "When you need a read-only feed with hand-picked, renamed JSON keys",
        "When anonymous users must be blocked from the endpoint",
        "Whenever XML output is required",
      ],
      answerIndex: 0,
      explain:
        "JSON:API is spec-compliant and exposes every entity type with no per-endpoint setup; it ships read-only by default, and one setting at /admin/config/services/jsonapi ('Accept all JSON:API create, read, update, and delete operations') unlocks create/read/update/delete across entities — ideal for a decoupled app. A Views REST export is read-only and shines when you want a curated feed shaped exactly for one consumer. Access control and XML don't decide between them.",
    },
  ],
};

export default lesson;
