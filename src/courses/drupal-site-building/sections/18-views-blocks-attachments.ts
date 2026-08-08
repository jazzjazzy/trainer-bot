import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "views-blocks-attachments",
  title: "Views as Blocks: Reusable Query Fragments",
  part: "Views: Queries Without Code",
  estMinutes: 12,
  summary:
    "Add block, attachment, and embed displays to one view to reuse the same query everywhere — overriding items, format, and More links per display (watch the For: dropdown) while contextual-filter defaults make placed blocks context-aware.",

  concept: `
## One query, many delivery mechanisms

A view is the query definition; a **display** is how it's delivered. Open any
view and next to Displays click **+ Add**: Page, Block, Attachment, Embed,
Feed. All displays share the fields, filters, and sorts you already built — a
Block display doesn't copy the query, it *reuses* it, and immediately shows up
in **Structure > Block layout > Place block** under the category you set in
its Block settings. This is the Symfony fragment-controller pattern (extract a
service, add a fragment route, \`render(controller(...))\` it into templates)
collapsed into one click.

## The "For:" dropdown — the #1 Views editing mistake

On a multi-display view, every settings modal opens with a dropdown at the
top: **For: All displays** or **This block (override)**. It defaults to *All
displays*. Change the block's pager without touching it and you just changed
the page display too — the classic Views editing accident. The discipline:
**read the For: dropdown before every Apply.** Once you do override, the
export shows the mechanism plainly: the display stores its own value and
records the override in a \`defaults\` map — \`defaults: { pager: false }\`
means "my pager is mine, not inherited from the default display."

The canonical split: the page display lists 25 items with a full pager; the
block overrides the pager to **Display a specified number of items** (5) and
adds a **More link** (*Use more*) whose target is the page display — both
live in the middle column's **Pager** section, right under Use pager
(**More link: Use more**, then **Link display: Page**). Sidebar teaser, full
listing one click away — one YAML file.

## Block-only powers

- **Items per block.** On the block display, *Block settings > Allow
  settings > Items per page* lets each **placed instance** pick its own
  count: the sidebar instance shows 5, a footer instance of the same block
  shows 3. The instance value exports in \`block.block.*.yml\` as
  \`settings.items_per_page\`; the "defer to the display" default exports as
  \`none\` in Drupal 10 and as \`null\` since Drupal 11.2 (same semantics,
  same UI select).
- **Contextual filter defaults.** A block has no URL of its own, so a
  contextual filter's *When the filter value is NOT available > Provide
  default value* does the work: **Taxonomy term ID from URL** with *Load
  default filter from node page* checked reads the term off the node being
  viewed. Result: a related-content block, zero code.

## Attachments and Embed

An **Attachment** display renders before or after *another display of the same
view* — say, a 3-item featured strip with its own format pinned above the main
listing, optionally inheriting contextual and exposed filters:

\`\`\`yaml
attachment_1:
  display_plugin: attachment
  display_options:
    displays:
      page_1: page_1
    attachment_position: before
    inherit_arguments: true
    inherit_pager: false
\`\`\`

An **Embed** display is the developer bridge: no path, no block, invisible in
Block layout — it exists to be rendered from code. In Drupal 10 that call is
\`views_embed_view('news', 'embed_1', $tid)\`; it's deprecated as of Drupal
11.4 in favor of the render element it always returned anyway:

\`\`\`php
$build['related'] = [
  '#type' => 'view',
  '#name' => 'news',
  '#display_id' => 'embed_1',
  '#arguments' => [$tid],
];
\`\`\`

(Twig Tweak's \`drupal_view()\` still covers templates.) Site builders keep
maintaining the query in the UI; your code just asks for the render array.
`,

  comparisons: [
    {
      label: "A block display = the fragment controller, free",
      intro:
        "Reuse the 'recent news' listing in a sidebar. Symfony extracts a fragment controller and embeds it per template; Views adds a display to the existing view and Block layout places it in any region.",
      php: `// The Symfony reflex: expose the query as a fragment.
#[Route('/_fragments/recent-news')]
public function recentNews(NewsRepository $repo): Response
{
    $items = $repo->findRecent(limit: 5);
    return $this->render('news/_recent.html.twig', [
        'items' => $items,
    ]);
}
// ...then embed it wherever the sidebar appears:
//   {{ render(controller(
//        'App\\Controller\\NewsController::recentNews')) }}`,
      ts: `# /admin/structure/views/view/news >
#   Displays: + Add > Block. Block settings >
#   Block name: "Recent news", Category: News. Save.
# Structure > Block layout > Sidebar > Place block
#   > "News: Block" > Save block.
# TWO exports result. The display (views.view.news.yml):
block_1:
  display_plugin: block
  id: block_1
  display_options:
    block_description: 'Recent news'
    block_category: News
    allow:
      items_per_page: items_per_page
# ...and the placement (block.block.olivero_newsblock.yml):
id: olivero_newsblock
theme: olivero
region: sidebar
plugin: 'views_block:news-block_1'
settings:
  label: 'Recent news'
  label_display: visible
  items_per_page: null  # the string 'none' in Drupal 10`,
      note:
        "The block plugin ID is derived: views_block:{view_id}-{display_id}. Same query, zero duplication — deleting the placement never touches the view.",
    },
    {
      label: "Per-display overrides: the 'For:' dropdown and the defaults map",
      intro:
        "Page shows 25 with a full pager; the block shows 5 with a 'More' link to the page. In PHP you'd thread a $limit parameter around; in Views you OVERRIDE the pager on the block display only — after switching the For: dropdown.",
      php: `// The code instinct: parameterize the shared query.
public function findRecent(int $limit = 25, int $offset = 0): array
{
    return $this->createQueryBuilder('a')
        ->orderBy('a.createdAt', 'DESC')
        ->setMaxResults($limit)
        ->setFirstResult($offset)
        ->getQuery()->getResult();
}
// Sidebar caller passes 5, page caller passes 25,
// and the "See all news" link is hand-written markup.`,
      ts: `# On block_1, click Pager > FIRST switch the top
#   dropdown "For: All displays" to "This block
#   (override)" > "Display a specified number of items",
#   5. Then, in the same Pager section: More link:
#   Use more; Link display: Page.
block_1:
  display_plugin: block
  display_options:
    pager:
      type: some
      options:
        items_per_page: 5
        offset: 0
    use_more: true
    use_more_always: false
    use_more_text: more
    link_display: page_1
    defaults:
      pager: false        # false = "I own this setting"
      use_more: false
      link_display: false`,
      note:
        "Forgetting the For: dropdown edits ALL displays — the #1 Views mistake. The defaults map is the tell in the export: every key set to false is an override; anything absent falls through to the default display.",
    },
    {
      label: "Context-aware block: related content from the current node",
      intro:
        "A 'related articles' block that changes per page. Symfony threads the current entity into the fragment; Views uses a contextual filter whose DEFAULT VALUE is filled from the node being viewed — blocks have no URL argument of their own.",
      php: `// Symfony: the fragment needs the current entity
// passed in, then a tag-overlap query.
public function related(Article $article, NewsRepository $repo): Response
{
    $tagIds = array_map(
        fn ($t) => $t->getId(),
        $article->getTags()->toArray(),
    );
    $items = $repo->findByTags(
        $tagIds,
        exclude: $article->getId(),
        limit: 5,
    );
    return $this->render('news/_related.html.twig', ['items' => $items]);
}`,
      ts: `# On block_1: Advanced > Contextual filters > Add >
#   "Has taxonomy term ID". When the filter value is
#   NOT available: Provide default value > Type:
#   "Taxonomy term ID from URL" > check "Load default
#   filter from node page, that's good for related
#   taxonomy blocks". Apply (this display).
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
      node: true
      limit: false
      anyall: ','`,
      note:
        "On /taxonomy/term/42 the block filters by term 42; on a node page it reads the node's own terms. One placed block, different results everywhere — no request object, no controller.",
    },
    {
      label: "Embed display: the sanctioned bridge back to code",
      intro:
        "Sometimes code genuinely must render the listing (inside a custom page, a mail, another render array). Don't re-implement the query in a block plugin — add an Embed display and call it.",
      php: `// The instinct: a custom block plugin re-running
// the query the view already defines.
class RelatedNewsBlock extends BlockBase {
  public function build(): array {
    $nids = \\Drupal::entityQuery('node')
      ->condition('type', 'article')
      ->condition('status', 1)
      ->sort('created', 'DESC')
      ->range(0, 5)
      ->accessCheck(TRUE)
      ->execute();
    // ...load nodes, view builder, cache metadata...
  }
}`,
      ts: `<?php
// Displays: + Add > Embed. No path, no block — invisible
// in Block layout, so it never clutters the site
// builder's UI. Exported as display_plugin: embed.
// Then ONE render array wherever one is welcome:
$build['related'] = [
  '#type' => 'view',
  '#name' => 'news',
  '#display_id' => 'embed_1',
  '#arguments' => [$term_id],
];
// views_embed_view('news', 'embed_1', $term_id) built
// exactly this element; it's deprecated as of Drupal
// 11.4 (still fine in Drupal 10). Extra arguments feed
// the contextual filters in order; access checks and
// the view's cache tags are handled at render time.
// In Twig (with Twig Tweak):
//   {{ drupal_view('news', 'embed_1', term_id) }}`,
      rightLang: "php",
      note:
        "The query, format, and fields stay editable in the Views UI by non-developers; your code holds only a reference. That division of labor is the whole point of the embed display.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Simulate how one view resolves settings across displays: the defaults map decides inherit-vs-override, the block placement can override the count once more, and a contextual default fills the argument a block never gets from a URL. Predict the resolved values before running.",
    code: `<?php
// One view, many displays. A non-default display stores ONLY what it
// overrides; its 'defaults' map records each override ("For: This
// block (override)"). This mirrors how views.view.*.yml resolves.

$view = [
  'default' => [
    'options' => [
      'items'  => 25,
      'pager'  => 'full',
      'format' => 'teaser list',
      'more'   => false,
    ],
  ],
  'page_1' => [
    'defaults' => [],   // overrode nothing: inherits everything
    'options'  => [],
  ],
  'block_1' => [
    'defaults' => ['items' => false, 'pager' => false, 'more' => false],
    'options'  => ['items' => 5, 'pager' => 'some', 'more' => 'link -> page_1'],
  ],
];

function resolve(array $view, string $display, string $key) {
  $d = $view[$display];
  if (isset($d['defaults'][$key]) && $d['defaults'][$key] === false) {
    return $d['options'][$key];               // "This display (override)"
  }
  return $view['default']['options'][$key];   // "For: All displays"
}

foreach (['page_1', 'block_1'] as $id) {
  echo $id . ":\\n";
  foreach (['items', 'pager', 'format', 'more'] as $key) {
    echo '  ' . str_pad($key, 6) . ' => '
      . var_export(resolve($view, $id, $key), true) . "\\n";
  }
}

// Block layout overrides once more at PLACEMENT time: the
// "Items per block" select exports as settings.items_per_page.
// "Defer to the display" is 'none' in Drupal 10, null since 11.2.
$placement = ['items_per_page' => 3];
$items = in_array($placement['items_per_page'], ['none', null], true)
  ? resolve($view, 'block_1', 'items')
  : $placement['items_per_page'];
echo "\\nSidebar instance renders " . $items . " rows\\n";

// Contextual filter default "Taxonomy term ID from URL": a block has
// no URL argument, so the default fills it from the node being viewed.
$url_term = null;             // not on a /taxonomy/term/... page
$node_terms = [12];           // current node is tagged with term 12
$arg = $url_term ?? $node_terms[0];
echo "Related block filters on term " . $arg . "\\n";`,
    output: `page_1:
  items  => 25
  pager  => 'full'
  format => 'teaser list'
  more   => false
block_1:
  items  => 5
  pager  => 'some'
  format => 'teaser list'
  more   => 'link -> page_1'

Sidebar instance renders 3 rows
Related block filters on term 12`,
  },

  keyPoints: [
    "One view holds the query; displays (page, block, attachment, embed, feed) are delivery mechanisms sharing its fields, filters, and sorts — add a Block display and it becomes placeable in any region via Structure > Block layout.",
    "Every settings modal on a multi-display view opens with a 'For:' dropdown defaulting to All displays; editing without switching to 'This block (override)' silently changes every display — the #1 Views editing mistake.",
    "Overrides export transparently: the display stores its own value plus a defaults map entry (defaults: { pager: false }); anything absent falls through to the default display.",
    "The classic split is 25 items/full pager on the page, 5 items on the block with 'Use more' pointing at the page display (link_display: page_1) — sidebar teaser plus full listing from one views.view.*.yml.",
    "'Allow settings: Items per page' on a block display adds an 'Items per block' control to each placed instance, exported per-placement as settings.items_per_page in block.block.*.yml.",
    "Contextual filter defaults ('Taxonomy term ID from URL' + 'Load default filter from node page') make placed blocks context-aware; Attachment displays pin a differently-formatted summary onto another display, and the Embed display exists solely to be rendered from code — a ['#type' => 'view'] render element, or views_embed_view() (deprecated as of Drupal 11.4).",
  ],

  interview: [
    {
      q: "You need the same 'recent news' query as a full page and as a 5-item sidebar teaser. How do you build that in Drupal without duplicating anything?",
      a: "One view, two displays. The view already has a page display listing 25 items; I add a **Block display**, which reuses the same fields, filters, and sorts, then place it in the sidebar region via **Block layout**. On the block display I switch the settings dropdown to *This block (override)* and change the pager to 'Display a specified number of items: 5', then enable **Use more** with **Link display: Page** so the teaser links to the full listing. Everything — both displays, the override, the more link — exports into the single `views.view.news.yml`, and the placement is a separate `block.block.*.yml`. In Symfony terms it's a fragment controller plus `render(controller(...))`, except the 'fragment' is config a site builder can keep editing.",
    },
    {
      q: "What's the most common mistake when editing a multi-display view, and how does the exported config reveal what actually happened?",
      a: "Editing a setting while the modal's **For:** dropdown still says *All displays* — you meant to shorten the sidebar block to 5 items and you just shortened the page too. The habit is to read that dropdown before every Apply and switch it to *This block (override)* when the change is display-specific. The export makes the mechanism auditable: an overriding display stores its own value **and** a `defaults` map entry like `defaults: { pager: false }`, meaning 'this option is mine'; any option missing from the display falls through to the default display. So in code review, a diff touching the default display's options when the ticket said 'sidebar only' is an immediate red flag.",
    },
    {
      q: "How would you deliver a 'related articles' block that changes depending on the node being viewed — without writing a block plugin?",
      a: "With a **contextual filter default** on a Views block display. I add the contextual filter *Has taxonomy term ID*, and since a block never receives URL arguments, I configure *When the filter value is NOT available > Provide default value > Taxonomy term ID from URL* and check *Load default filter from node page, that's good for related taxonomy blocks*. Placed once, the block reads the current node's terms and lists other content sharing them — on a term page it uses the term from the URL instead. To polish it, a second contextual filter or a null-exclusion setting can drop the current node from its own results. It replaces the whole custom-block-plugin-plus-entity-query approach with exportable config.",
    },
    {
      q: "When do you reach for an Attachment display versus an Embed display?",
      a: "An **Attachment** composes *within* Views: it renders its result before or after another display of the same view — e.g. a 3-item featured strip in a different format pinned above the main page listing — and can inherit that display's contextual filters, exposed filters, and pager (`attachment_position`, `inherit_arguments`, etc. in the export). An **Embed** display is for composition *from code*: it has no path and no block, stays invisible in Block layout, and exists to be rendered as `['#type' => 'view', '#name' => 'news', '#display_id' => 'embed_1', '#arguments' => [$arg]]` — or via `views_embed_view()`, which returned exactly that element (or NULL when access failed) and is deprecated as of Drupal 11.4. Rule of thumb: attachment when Views itself hosts both pieces, embed when a controller, custom block, or Twig template needs the listing while site builders keep owning the query.",
    },
  ],

  quiz: [
    {
      question:
        "On a view with a page and a block display, you open the block's Pager settings, change 25 to 5, and click Apply without touching anything else. What happened?",
      options: [
        "Only the block now shows 5 items — settings modals always scope to the display you clicked from",
        "Both the page AND the block now show 5 items, because the For: dropdown defaulted to 'All displays'",
        "Nothing, until you also check 'Allow settings: Items per page'",
        "Drupal blocks the save with a validation error about conflicting pagers",
      ],
      answerIndex: 1,
      explain:
        "The For: dropdown at the top of every settings modal defaults to 'All displays'; unless you switch it to 'This block (override)' first, the edit lands on the default display and every display inheriting from it. This is the #1 Views editing mistake.",
    },
    {
      question:
        "A block display's pager is overridden to 10 items, 'Allow settings: Items per page' is enabled, and a placed instance sets 'Items per block' to 3. How many rows does that instance render?",
      options: [
        "10 — the display's pager always wins",
        "25 — the default display's setting wins",
        "3 — the placement-level items_per_page overrides the display when it isn't the defer value ('none'/null)",
        "13 — the values are added together",
      ],
      answerIndex: 2,
      explain:
        "Settings layer: default display, then the block display's override, then the placed instance's settings.items_per_page in block.block.*.yml. A concrete value at placement time wins; the defer value — the string 'none' in Drupal 10, null since Drupal 11.2 — falls back to the display's pager (10 here).",
    },
    {
      question:
        "What makes a Views block show related content that changes per node page, with no custom code?",
      options: [
        "An exposed filter that visitors fill in",
        "A contextual filter whose default value is 'Taxonomy term ID from URL' with 'Load default filter from node page' checked",
        "The 'Use more' link pointed at the node",
        "An attachment display attached to the node's full display",
      ],
      answerIndex: 1,
      explain:
        "Blocks receive no URL argument, so the contextual filter's 'Provide default value' fires: the taxonomy_tid default argument plugin reads the term from a term-page URL or, with the node option checked, from the node currently being viewed — making one placed block context-aware.",
    },
    {
      question:
        "Why add an Embed display to a view instead of just calling the block display from code?",
      options: [
        "Embed displays run faster because they skip access checks",
        "views_embed_view() only accepts embed displays, never other types",
        "It has no path or block, so it never clutters Block layout — a display that exists purely to be rendered from code ('#type' => 'view' render element / views_embed_view() / drupal_view())",
        "Embed displays cannot have contextual filters, which keeps them simple",
      ],
      answerIndex: 2,
      explain:
        "Code can technically render any display, but the embed display type is the convention: no route, no block plugin, invisible to site builders in Block layout, and clearly signaling 'this display is consumed by code'. Contextual filters work fine on it — the render element's #arguments (or the extra arguments to views_embed_view(), deprecated as of Drupal 11.4) feed them in order.",
    },
  ],
};

export default lesson;
