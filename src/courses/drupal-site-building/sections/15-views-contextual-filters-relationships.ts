import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "views-contextual-filters-relationships",
  title: "Contextual Filters & Relationships: Joins and Route Params",
  part: "Views: Queries Without Code",
  estMinutes: 13,
  summary:
    "Use the Advanced column's two power features: Contextual filters bind a WHERE clause to a route parameter (with defaults and validation), and Relationships add the JOINs that let a view reach fields on referenced — or referencing — entities.",

  concept: `
## The Advanced column: where the query grows joins and parameters

So far every view has been a static query. The **Advanced** column on the right
of the Views edit page adds the two things your Symfony controllers supply by
hand: request input and joins.

## Contextual filters: WHERE bound to a route param

A **contextual filter** (internally an *argument*) is a filter whose value
comes from context instead of config — usually a URL path segment. Give a page
display the path \`author/%user\` and add the contextual filter
**Content: Authored by**: the \`%\` segment is consumed as the value, exactly
like a controller reading \`\$request->attributes->get('user')\` and feeding it
to \`->andWhere('a.author = :author')\`. Multiple contextual filters map to URL
segments **positionally**, in the order listed. Core uses this everywhere: the
stock taxonomy term page at \`/taxonomy/term/{tid}\` is just a view with a term
ID contextual filter.

Because a view can also render where there is no URL value (a block, an embed),
each argument declares what happens **when the filter value is not available**:

- **Display all results** (ignore) or **hide the view** (empty text)
- **Show "Page not found"** — your \`createNotFoundException()\`
- **Display a summary** — an auto-built list of all distinct values with counts
- **Provide default value** — run a *default value plugin*: fixed value, raw
  value from the URL, query parameter, **User ID from logged in user**,
  **Content ID from URL**, or **Taxonomy term ID from URL**

Then, **when the value IS present**, optional validation kicks in: *Specify
validation criteria*, pick a validator such as \`entity:taxonomy_term\`
(restricted to chosen bundles), and choose the failure action — usually 404.
That is your ParamConverter plus \`NotFoundHttpException\`, as config.

## Relationships: JOINs that unlock more fields

A base table only offers its own fields. A **relationship** follows an entity
reference and JOINs the target's table into the query, so its fields, filters,
and sorts appear in the Add dialogs — each tagged with a \`relationship:\` key
in the export. Add **User** (the author \`uid\` reference) and suddenly the
user's name, mail, and picture are addable columns: Article → field_author →
user fields, no \`->join()->addSelect()\` written.

Two settings matter:

- **Require this relationship** — checked = INNER JOIN (rows without a target
  vanish); unchecked = LEFT JOIN (rows survive with empty columns).
- **Direction** — reference fields also generate a *reverse* relationship
  ("Content using field_brand", plugin \`entity_reverse\`): from a Brand, join
  back to every Article that references it.

## The two classic builds

1. **Content by author**: page at \`author/%user\`, contextual filter
   *Authored by* (validate \`entity:user\`, fail → 404), plus a *User* (author)
   relationship so each row can show the user's real name.
2. **Related articles**: block of Articles with contextual filter *Has
   taxonomy term ID*, default value **Taxonomy term ID from URL** with *Load
   default filter from node page* checked — the block inherits the current
   article's tags — plus a second contextual filter on *Content: ID*, default
   **Content ID from URL**, with **Exclude** ticked so the article never lists
   itself.

Both are pure config: two entries under \`arguments:\` and one under
\`relationships:\` in \`views.view.*.yml\`.
`,

  comparisons: [
    {
      label: "A route param becomes a contextual filter",
      intro:
        "A page listing one author's content. In Symfony that's a route placeholder, a param converter, and a WHERE clause in a controller. In Views the % path segment IS the parameter, and the contextual filter binds it into the query.",
      php: `#[Route('/author/{user}', name: 'author_content')]
public function byAuthor(User $user): Response
{
    $articles = $this->repo->createQueryBuilder('a')
        ->andWhere('a.author = :author')
        ->setParameter('author', $user)
        ->orderBy('a.createdAt', 'DESC')
        ->getQuery()->getResult();

    return $this->render('author/content.html.twig', [
        'user' => $user,
        'articles' => $articles,
    ]);
}`,
      ts: `# Views UI: Add a Page display, set Path: /author/%user
# Advanced > Contextual filters > Add >
#   "Content: Authored by" > Apply.
# Exported views.view.author_content.yml (trimmed):
display_options:
  path: author/%user
  arguments:
    uid:
      id: uid
      table: node_field_data
      field: uid
      relationship: none
      plugin_id: entity_target_id  # was 'numeric' before Drupal 10.3
      title_enable: true
      title: 'Content by {{ arguments.uid }}'`,
      note:
        "Each % segment feeds the next contextual filter in listed order — route placeholder, param binding, and WHERE clause collapse into one config entry. The title box even takes argument tokens.",
    },
    {
      label: "Missing or invalid value: defaults and validation",
      intro:
        "What if the URL has no author, or a bogus one? In a controller you null-coalesce to the logged-in user and throw a 404 on bad IDs. In Views both behaviors are dropdowns on the argument.",
      php: `// Same route, now tolerant: no {user} segment means
// "my content", an unknown id means 404.
public function byAuthor(?int $uid): Response
{
    $uid ??= $this->getUser()?->getId()
        ?? throw $this->createNotFoundException();

    $user = $this->users->find($uid)
        ?? throw $this->createNotFoundException();

    // ...same query as before, using $user
}`,
      ts: `# On the contextual filter:
# "When the filter value is NOT available":
#   Display all results / Hide view / Page not found /
#   Display a summary / Provide default value
# "When the filter value IS available":
#   Specify validation criteria
arguments:
  uid:
    # ...
    default_action: default
    default_argument_type: current_user  # logged-in user
    specify_validation: true
    validate:
      type: 'entity:user'
      fail: 'not found'                  # 404 on bad ids
    validate_options:
      access: false
      operation: view
      multiple: 0`,
      note:
        "default_argument_type options include fixed, raw (URL path component), query_param, current_user, node (Content ID from URL), and taxonomy_tid (term ID from URL). 'Display a summary' is a bonus: a grouped list of every value with counts — the classic glossary page, free.",
    },
    {
      label: "Relationships are joins — forward and reverse",
      intro:
        "Show each article's author name (follow the uid reference), and elsewhere list every article referencing a Brand (follow the reference backwards). Doctrine: join()/leftJoin() plus mappedBy for the inverse side. Views: two entries under Relationships.",
      php: `// Forward: article -> author (INNER JOIN).
$qb->join('a.author', 'u')->addSelect('u');
// leftJoin() instead if authorless rows must survive.

// Reverse: all articles referencing this brand —
// query from the owning side:
$articles = $this->repo->createQueryBuilder('a')
    ->join('a.brand', 'b')
    ->andWhere('b.id = :brand')
    ->setParameter('brand', $brand->getId())
    ->getQuery()->getResult();`,
      ts: `# Advanced > Relationships > Add > "User" (the author
# reference), check "Require this relationship" (INNER JOIN).
relationships:
  uid:
    id: uid
    table: node_field_data
    field: uid
    admin_label: User
    plugin_id: standard
    required: true          # unchecked = LEFT JOIN
fields:
  name:                     # only addable AFTER the join
    id: name
    table: users_field_data
    field: name
    relationship: uid       # this field rides the join
    plugin_id: field

# Reverse (in a view of Brand content): Relationships >
# Add > "Content using field_brand":
#   reverse__node__field_brand:
#     plugin_id: entity_reverse`,
      note:
        "required: true = INNER JOIN, false = LEFT JOIN — the exact join-type decision you make in Doctrine. Reverse relationships (plugin entity_reverse) answer 'who references me?' without touching the owning side's config.",
    },
    {
      label: "The 'related articles' block: two arguments, zero controllers",
      intro:
        "Under an article, show other articles sharing its tags — excluding itself. By hand that's a self-join through the term index wired to the current node in a controller. In Views it's two contextual filters with clever defaults.",
      php: `// Controller: load current node's term ids, then:
$sql = "SELECT DISTINCT n.nid, n.title
        FROM node_field_data n
        JOIN taxonomy_index ti ON ti.nid = n.nid
        WHERE ti.tid IN (:tids)   -- current node's tags
          AND n.nid <> :current   -- not itself
          AND n.status = 1
        ORDER BY n.created DESC
        LIMIT 5";
// ...plus the plumbing to fetch :tids from the
// node being viewed and pass :current along.`,
      ts: `# Block display. Contextual filter 1:
#   "Content: Has taxonomy term ID", default value
#   "Taxonomy term ID from URL" + CHECK "Load default
#   filter from node page..." — the related-content trick.
# Contextual filter 2: "Content: ID", default
#   "Content ID from URL", CHECK "Exclude".
arguments:
  tid:
    id: tid
    table: taxonomy_index
    field: tid
    plugin_id: taxonomy_index_tid
    default_action: default
    default_argument_type: taxonomy_tid
    default_argument_options:
      term_page: true
      node: true       # take terms from the viewed node
      anyall: '+'      # multiple terms joined as OR
    break_phrase: true
  nid:
    plugin_id: node_nid
    default_action: default
    default_argument_type: node
    not: true          # everything EXCEPT this node`,
      note:
        "Place the block on article pages and it self-configures per node: the defaults read the current route, so no PHP ever passes the node along. 'not: true' is the Exclude checkbox — a NOT IN clause by config.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Simulate the contextual-filter pipeline for a 'content by author' page at /author/%user: take the URL value if present, otherwise run the default value plugin, validate, then bind into the query (with the author relationship's INNER JOIN). Predict all three requests before running.",
    code: `<?php
// Views resolves a contextual filter in this order:
//   1. take the URL segment if present
//   2. otherwise run the default value plugin
//   3. validate it (specify_validation)
//   4. bind it into WHERE — or fire the fail action.

$argument = [
  'field'        => 'node_field_data.uid',
  'default_type' => 'current_user',  // User ID from logged in user
  'validator'    => 'entity:user',
  'fail'         => 'not found',     // -> 404, your NotFoundHttpException
];

// A required "author" relationship contributes this join:
$join = 'INNER JOIN users_field_data u ON u.uid = node_field_data.uid';

$validUsers  = [5, 12, 31];          // pretend user storage
$currentUser = 5;                    // the logged-in visitor

foreach (['/author/12', '/author', '/author/999'] as $path) {
  $parts = array_values(array_filter(explode('/', $path)));
  $raw   = $parts[1] ?? null;        // the %user segment, if any

  $source = $raw !== null ? 'URL' : 'default (' . $argument['default_type'] . ')';
  $value  = (int) ($raw ?? $currentUser);

  echo $path . "\\n";
  echo "  argument from " . $source . ": " . $value . "\\n";

  if (!in_array($value, $validUsers, true)) {
    echo "  " . $argument['validator'] . " validation FAILED -> "
      . $argument['fail'] . " (404)\\n";
    continue;
  }

  echo "  " . $join . "\\n";
  echo "  WHERE " . $argument['field'] . " = " . $value . "\\n\\n";
}`,
    output: `/author/12
  argument from URL: 12
  INNER JOIN users_field_data u ON u.uid = node_field_data.uid
  WHERE node_field_data.uid = 12

/author
  argument from default (current_user): 5
  INNER JOIN users_field_data u ON u.uid = node_field_data.uid
  WHERE node_field_data.uid = 5

/author/999
  argument from URL: 999
  entity:user validation FAILED -> not found (404)`,
  },

  keyPoints: [
    "Contextual filters (arguments) bind a WHERE clause to context — usually a % path segment on a page display, consumed positionally like route params read from $request->attributes.",
    "Every argument declares its no-value behavior: display all, hide, 404, a summary listing of all values, or a default from a plugin (fixed, raw URL component, query param, logged-in user, Content ID from URL, term ID from URL).",
    "Validation is config too: 'Specify validation criteria' with a validator like entity:taxonomy_term (bundle-restricted) and a fail action — ParamConverter + NotFoundHttpException without a controller.",
    "Relationships JOIN a referenced entity's table into the view so its fields/filters/sorts become addable; each such handler carries relationship: <id> in the export.",
    "'Require this relationship' checked = INNER JOIN (rows without a target disappear); unchecked = LEFT JOIN. Reverse relationships (plugin entity_reverse) follow references backwards: all Articles referencing this Brand.",
    "The two canonical patterns — /author/%user pages and 'related articles by shared term' blocks — are pure config: arguments: and relationships: entries in views.view.*.yml.",
  ],

  interview: [
    {
      q: "Views has regular filters, exposed filters, and contextual filters. When do you reach for each?",
      a: "Regular **filter criteria** are baked into the query — fixed conditions like `status = 1`, chosen by the site builder. **Exposed filters** hand the widget to the visitor as a form, so the value arrives as a query parameter they control. **Contextual filters** take their value from context — typically a URL path segment on a page display, a term ID on a taxonomy page, or a fallback like the logged-in user — with no widget at all. The Symfony mapping: regular filters are hardcoded `andWhere()` calls, exposed filters read `$request->query`, and contextual filters read `$request->attributes` (route params). If the value identifies *which page this is* (author 12's page, term 7's page), it's contextual.",
    },
    {
      q: "How do Views relationships map to the joins you'd write in Doctrine, and what does 'Require this relationship' actually change?",
      a: "A relationship follows an entity reference and JOINs the target table into the query, which is what exposes the target's fields, filters, and sorts in the Add dialogs — each one then carries a `relationship:` key in the exported YAML, like an aliased join in DQL. 'Require this relationship' is literally the INNER-vs-LEFT decision: checked produces an INNER JOIN so rows without a target drop out; unchecked produces a LEFT JOIN so rows survive with empty columns. Reference fields also generate a reverse relationship (plugin `entity_reverse`) that follows the reference backwards — from a Brand to every Article whose `field_brand` points at it — equivalent to querying from the owning side in Doctrine. Verify what you built with 'Show the SQL query' in the preview: you'll see the exact JOIN type.",
    },
    {
      q: "Walk me through building a 'related articles' block — same tags as the current article, excluding itself — without writing a module.",
      a: "Create a view of Content (Articles) with a block display. Add contextual filter **Has taxonomy term ID**; since blocks get no URL argument, set 'When the filter value is not available' to *Provide default value* → **Taxonomy term ID from URL** and check *Load default filter from node page* — that option reads the taxonomy terms off the node currently being viewed, which is the whole trick. Allow multiple values so several tags OR together. Then add a second contextual filter on **Content: ID** with default value **Content ID from URL** and the **Exclude** checkbox ticked, so the current article is filtered out with a NOT condition. Place the block on article pages; the exported config is two `arguments:` entries and it self-adapts to every article with zero controllers.",
    },
    {
      q: "A view at /author/%user gets requested with a missing or garbage user ID. What are your configuration options for handling each case?",
      a: "For a **missing** value, the argument's 'When the filter value is not available' setting decides: display all results, hide the view, return 'Page not found', display a summary (an auto-generated list of all distinct values with counts — the classic glossary), or provide a default via a plugin such as *User ID from logged in user* — the config equivalent of null-coalescing to `$this->getUser()`. For a **present but invalid** value, enable 'Specify validation criteria', pick a validator like `entity:user` (for terms you can also restrict to specific vocabularies), and set the fail action, usually 'Show Page not found'. That pairing replaces the param-converter-plus-`createNotFoundException()` dance in a controller, and it all lives in `views.view.*.yml` under `arguments:`.",
    },
  ],

  quiz: [
    {
      question:
        "You add an Author relationship and check 'Require this relationship'. What is the SQL consequence?",
      options: [
        "A LEFT JOIN — articles without an author show empty author columns",
        "An INNER JOIN — articles without a valid author disappear from the results",
        "A subquery — authors are fetched in a second query per row",
        "No SQL change — the setting only affects field labels",
      ],
      answerIndex: 1,
      explain:
        "'Require this relationship' exports as required: true and produces an INNER JOIN, so rows with no join target are excluded. Unchecked means LEFT JOIN and the rows survive with empty related columns — the same decision as Doctrine's join() vs leftJoin().",
    },
    {
      question:
        "In a 'related articles' block, which setting makes the term IDs come from the article currently being viewed, even though a block has no URL argument?",
      options: [
        "An exposed filter on field_tags",
        "Default value 'Taxonomy term ID from URL' with 'Load default filter from node page' checked",
        "A reverse relationship on field_tags",
        "Setting the block display's path to /node/%",
      ],
      answerIndex: 1,
      explain:
        "The taxonomy_tid default value plugin can read the route: on a node page, the 'Load default filter from node page, that's good for related taxonomy blocks' option pulls the viewed node's term IDs as the argument. Pair it with a Content: ID argument set to Exclude so the article never lists itself.",
    },
    {
      question:
        "A page display at author/%user is visited at plain /author. The contextual filter's no-value action is 'Provide default value: User ID from logged in user'. What renders?",
      options: [
        "A 404, because the % segment is required",
        "All content by all authors",
        "The logged-in visitor's own content — a 'my content' page for free",
        "An empty view with the exposed filter form",
      ],
      answerIndex: 2,
      explain:
        "With default_action: default and default_argument_type: current_user, a missing URL value falls back to the logged-in user's uid — the config equivalent of $uid ??= $this->getUser()->getId(). A 404 would only happen if the no-value action were 'Show Page not found' (or validation failed).",
    },
    {
      question:
        "Articles reference Brand content via field_brand. You're building a view OF Brands and want a column counting the Articles that reference each Brand. Which feature do you reach for first?",
      options: [
        "A contextual filter on Content: ID",
        "The reverse relationship 'Content using field_brand' (plugin entity_reverse)",
        "An exposed filter on field_brand",
        "Rewrite results with a {{ nid }} token",
      ],
      answerIndex: 1,
      explain:
        "Only a reverse relationship follows the reference backwards from the target (Brand) to the entities that point at it (Articles) — a forward relationship would need the view to be based on Articles instead. Once the entity_reverse join is in place, aggregation can COUNT the joined article IDs per brand.",
    },
  ],
};

export default lesson;
