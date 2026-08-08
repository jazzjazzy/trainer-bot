import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "views-exposed-filters-search",
  title: "Exposed Filters: User-Facing Search Pages",
  part: "Views: Queries Without Code",
  estMinutes: 12,
  summary:
    "Flip any Views filter or sort to 'exposed' and end users get the form control — keyword contains, type select, term dropdown, exposed sort, AJAX, and a form-in-a-block — replacing an entire Symfony search controller, form type, and query wiring with clicks.",

  concept: `
## Any filter can become the form

Last lesson's filters were baked into the query. Open any filter's settings and
check **Expose this filter to visitors, to allow them to change it** — Views now
renders a form control matched to the filter type: a string filter becomes a
text input, the content-type filter a select, a taxonomy-term filter a dropdown
or autocomplete, a date filter date inputs (choose the *between* operator and
you get a range). The form submits via **GET**, so every search is a shareable,
bookmarkable URL — and pager links preserve the query string automatically.
An empty, non-required input simply drops its condition from the WHERE clause.

### Per-filter exposed settings

Exposing reveals a settings block per filter:

- **Label / description** — what the visitor sees next to the control.
- **Filter identifier** — the query-string parameter name (\`?q=drupal\`).
- **Placeholder** — for string and date filters.
- **Required** — no results until the visitor filters.
- **Remember the last selection** — per-role, stored in the session.
- **Expose operator** — the visitor also picks *contains / is equal to /
  starts with*; you can limit which operators appear.
- **Allow multiple selections** — for select-style filters.

## Exposed sorts

Sort criteria expose too: check **Expose this sort to visitors** on
*Authored on* and *Title* and the form grows a "Sort by" select (plus Asc/Desc
if you expose the order). The labels live under **Advanced > Exposed form
style > Settings**, alongside the submit button text and an optional reset
button.

## Two display-level switches

- **Use AJAX** (Advanced > Other) — submitting the form swaps the results in
  place, no full page reload. Trade-off: core's AJAX does not update the
  address bar, so a primary search page that should have shareable URLs often
  leaves it off.
- **Exposed form in block** (Advanced) — rips the form out of the results area
  and registers it as its own block. Place "Exposed form: search-page_1" at
  **Structure > Block layout** — sidebar form, main-column results, still one
  view.

## The zero-code search page

Combine three exposed filters — **Title (contains)** + **Content type** +
**Has taxonomy term** — and you have the classic faceted-ish search page. In
Symfony that is a controller, a form type, one conditional \`andWhere()\` per
field, and pagination that must carry every parameter. Here it is three
checkboxes, and the whole thing exports as \`views.view.search.yml\`.

## Where the ceiling is

Title *contains* is \`LIKE '%…%'\`: no relevance ranking, no stemming, no
result counts beside each facet. Real fulltext search is the **Search API**
module (database or Solr backends) plus the **Facets** module — both of which
render *through* Views, so everything in this lesson transfers. And when the
default selects feel clunky, **Better Exposed Filters (BEF)** swaps them for
radios, links, checkboxes, and sliders — another contrib module, still zero
code.
`,

  comparisons: [
    {
      label: "Expose a filter = delete your search controller",
      intro:
        "A keyword search over news titles. In Symfony you route it, read the query string, and conditionally extend the query. In Views you check one box on the filter you already have.",
      php: `#[Route('/news/search', name: 'news_search')]
public function search(Request $req, ArticleRepository $repo): Response
{
    $q = $req->query->getString('q');
    $qb = $repo->createQueryBuilder('a')
        ->andWhere('a.published = true');
    if ($q !== '') {
        $qb->andWhere('a.title LIKE :q')
           ->setParameter('q', '%' . $q . '%');
    }
    // ...plus the form template, keeping ?q= alive
    // across pager links, an empty-input guard...
}`,
      ts: `# Views UI: open the "Content: Title" filter >
#   check "Expose this filter to visitors" >
#   Label: Search, Operator: Contains,
#   Filter identifier: q, Placeholder: "Search news..."
# Exported in views.view.news.yml (trimmed):
filters:
  title:
    id: title
    table: node_field_data
    field: title
    plugin_id: string
    operator: contains
    value: ''
    exposed: true
    expose:
      identifier: q
      label: 'Search'
      placeholder: 'Search news...'
      operator_id: q_op
      use_operator: false
      required: false
      remember: false
      multiple: false`,
      note:
        "The 'Filter identifier' IS the GET parameter: this form submits to ?q=drupal. Empty optional input drops the condition entirely — the if() guard you'd write by hand is built in.",
    },
    {
      label: "Three exposed filters = a faceted-ish search page",
      intro:
        "Keyword + content type + topic term. The Symfony version is a hand-declared form type wired to conditional query logic; the Views version is the same three filters from last lesson, each with 'expose' checked.",
      php: `class SearchFilterType extends AbstractType
{
    public function buildForm(FormBuilderInterface $b, array $o): void
    {
        $b->setMethod('GET')
          ->add('q', SearchType::class, ['required' => false])
          ->add('type', ChoiceType::class, [
              'choices' => ['Article' => 'article', 'News' => 'news'],
              'required' => false,
          ])
          ->add('topic', EntityType::class, [
              'class' => Term::class, 'multiple' => true,
          ]);
    }
}
// ...then a controller adding one conditional
// andWhere() per non-empty submitted field.`,
      ts: `# Same view, three filters, three "expose" checkboxes:
# 1. Content: Title > Expose (operator: Contains)
# 2. Content: Content type > Expose (renders a select)
# 3. Content: Has taxonomy term, Vocabulary: Topics,
#    "Dropdown" > Expose > Allow multiple selections
filters:
  title:
    plugin_id: string
    operator: contains
    exposed: true
    expose:
      identifier: q
      label: 'Search'
  type:
    plugin_id: bundle
    exposed: true
    expose:
      identifier: type
      label: 'Type'
  tid:
    table: taxonomy_index
    plugin_id: taxonomy_index_tid
    vid: topics
    type: select
    hierarchy: false
    exposed: true
    expose:
      identifier: topic
      label: 'Topic'
      multiple: true`,
      note:
        "This is 'faceted-ish': filters, but no result counts or relevance. True facets and fulltext = Search API + Facets contrib, which still render through Views. BEF contrib restyles these controls as radios/links/sliders.",
    },
    {
      label: "Exposed sort + AJAX + form-in-a-block",
      intro:
        "Let visitors re-sort, swap results without a reload, and put the form in the sidebar. Each is code in Symfony (sort whitelist, fetch() wiring, layout surgery) and a checkbox in Views.",
      php: `// Whitelist the sort param (never trust raw input):
$allowed = ['created' => 'a.createdAt', 'title' => 'a.title'];
$key = $req->query->getString('sort_by', 'created');
$qb->orderBy(
    $allowed[$key] ?? 'a.createdAt',
    $req->query->getString('sort_order') === 'ASC' ? 'ASC' : 'DESC',
);
// No-reload updates: a Stimulus controller, fetch(),
// a partial template, spinner state... and moving the
// form to the sidebar means reworking the layout.`,
      ts: `# Sort criteria > Content: Authored on > Settings >
#   check "Expose this sort to visitors"
# Advanced > Use AJAX: Yes
# Advanced > Exposed form in block: Yes, then place
#   "Exposed form: news-page_1" at Structure > Block layout
display_options:
  use_ajax: true
  exposed_block: true
  exposed_form:
    type: basic
    options:
      submit_button: Apply
      reset_button: true
      exposed_sorts_label: 'Sort by'
      expose_sort_order: true
  sorts:
    created:
      id: created
      field: created
      order: DESC
      exposed: true
      expose:
        label: 'Date posted'
        field_identifier: created`,
      note:
        "Exposed sorts arrive as ?sort_by=created&sort_order=ASC — already whitelisted to the sorts you added. Core AJAX doesn't update the URL bar, so skip it when shareable search URLs matter.",
    },
    {
      label: "Expose the operator + remember the selection",
      intro:
        "Power-user touches: let the visitor choose contains vs. exact match, and have the form recall their last search. Session plumbing in Symfony; two checkboxes in the filter's exposed settings.",
      php: `// Visitor picks the operator; session recalls input:
$op = $req->query->getString('q_op', 'contains');
$q  = $req->query->getString('q')
    ?: $req->getSession()->get('news_q', '');
$req->getSession()->set('news_q', $q);
$qb->andWhere($op === '=' ? 'a.title = :q' : 'a.title LIKE :q')
   ->setParameter('q', $op === '=' ? $q : '%' . $q . '%');`,
      ts: `# In the exposed Title filter's settings:
#   check "Expose operator" (a Contains / Is equal to
#   select appears next to the text box), optionally
#   "Limit the available operators";
#   check "Remember the last selection" + pick roles.
expose:
  identifier: q
  use_operator: true
  operator: q_op
  operator_limit_selection: true
  operator_list:
    contains: contains
    '=': '='
  remember: true
  remember_roles:
    authenticated: authenticated`,
      note:
        "The operator travels as its own GET param (?q_op=contains). 'Remember' is per-role and session-backed — anonymous users typically share one page cache, so remember is usually for logged-in roles.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Simulate how an exposed-filter view handles two requests: one with a submitted query string (including a visitor-chosen operator), one first load with nothing submitted. Predict both WHERE clauses before running.",
    code: `<?php
// Exposed filters = Views merges the URL's query string into the query.
// Config declares the form; GET params fill it; empty optional inputs
// silently drop their condition.

$filters = [
  'title' => [
    'exposed' => true,  'identifier' => 'q',
    'operator' => 'contains', 'use_operator' => true,
  ],
  'type' => [
    'exposed' => true,  'identifier' => 'type', 'operator' => 'in',
  ],
  'status' => [
    'exposed' => false, 'operator' => '=', 'value' => '1',
  ],
];

function buildWhere(array $filters, array $get): array {
  $where = [];
  foreach ($filters as $field => $f) {
    if (empty($f['exposed'])) {           // baked in: visitors never see it
      $where[] = $field . ' ' . $f['operator'] . ' ' . $f['value'];
      continue;
    }
    $input = $get[$f['identifier']] ?? '';
    if ($input === '') { continue; }      // optional + empty = no condition
    // "Expose operator": the visitor's ?q_op= overrides the default.
    $op = !empty($f['use_operator']) && isset($get[$f['identifier'] . '_op'])
      ? $get[$f['identifier'] . '_op']
      : $f['operator'];
    $where[] = match ($op) {
      'contains'    => "$field LIKE '%$input%'",
      'starts'      => "$field LIKE '$input%'",
      'in'          => "$field IN ('$input')",
      default       => "$field $op '$input'",
    };
  }
  return $where;
}

$submitted = ['q' => 'drupal', 'q_op' => 'starts', 'type' => 'article'];
echo "-- /search?q=drupal&q_op=starts&type=article\\n";
echo "WHERE " . implode("\\n  AND ", buildWhere($filters, $submitted)) . "\\n\\n";

echo "-- /search (first load, nothing submitted)\\n";
echo "WHERE " . implode("\\n  AND ", buildWhere($filters, [])) . "\\n";`,
    output: `-- /search?q=drupal&q_op=starts&type=article
WHERE title LIKE 'drupal%'
  AND type IN ('article')
  AND status = 1

-- /search (first load, nothing submitted)
WHERE status = 1`,
  },

  keyPoints: [
    "Check 'Expose this filter to visitors' on any filter and Views renders the matching form control (text input, select, term dropdown, date range) and merges GET input into the query — empty optional inputs drop their condition.",
    "The 'Filter identifier' is the query-string parameter name, so every search is a shareable URL, and pager links preserve all exposed values automatically.",
    "Per-filter exposed settings cover label, placeholder, required, 'remember the last selection' (per-role), multiple selection, and 'Expose operator' so the visitor picks contains / equals / starts with.",
    "Sorts expose too ('Sort by' select via ?sort_by= / ?sort_order=), and two display-level switches finish the page: 'Use AJAX' for no-reload updates (but no URL change) and 'Exposed form in block' to place the form anywhere via Block layout.",
    "Title-contains + content-type select + taxonomy-term dropdown = a faceted-ish search page with zero code — the entire Symfony controller + form type + query wiring collapses into checkboxes exported to views.view.*.yml.",
    "Know the ceiling: real fulltext relevance and true facets are Search API + Facets contrib (both render through Views); Better Exposed Filters (BEF) restyles the controls as radios, links, and sliders.",
  ],

  interview: [
    {
      q: "You need a search page: keyword, content-type dropdown, topic filter, pagination. Walk me through the Drupal build versus what you'd do in Symfony.",
      a: "In Symfony that's a route, a controller, a GET-method form type, one conditional `andWhere()` per field, and a paginator that carries every parameter. In Drupal I'd build (or reuse) a page view, add the three filters — Title, Content type, Has taxonomy term — and check **Expose this filter to visitors** on each. Views generates the form (text input, bundle select, term dropdown), reads the GET query string using each filter's identifier, drops empty optional conditions, and the pager preserves the parameters automatically. The whole page exports as one `views.view.*.yml` config entity, so the 'search feature' ships as reviewable config, not code.",
    },
    {
      q: "When are exposed filters not enough, and what do you reach for then?",
      a: "Exposed title filters are `LIKE '%term%'` under the hood: no relevance ranking, no stemming or typo tolerance, no counts next to each facet option, and it only searches the fields you filter on. The moment those matter, the answer is the **Search API** module — it indexes entities into a backend (database for small sites, Solr/Elasticsearch for real ones) and exposes the index as a Views base table — plus the **Facets** module for genuine facet blocks with counts. Crucially, the result pages are still Views, so the exposed-filter skills transfer directly. I'd also name-drop **Better Exposed Filters** for UX polish (radios, sliders, auto-submit) when the requirement is presentation rather than search quality.",
    },
    {
      q: "The design puts the search form in the sidebar and the results in the main column. How do you do that with one view?",
      a: "Set **Exposed form in block: Yes** under the view's Advanced column. Views then stops rendering the form above the results and instead registers it as a block — 'Exposed form: viewname-display' — that I place in the sidebar region at **Structure > Block layout**. It still submits against the view's page via GET, so results, pager, and shareable URLs all keep working. That block placement is itself config, so the entire arrangement (view + form position) deploys through `drush cex`/`cim` like everything else.",
    },
    {
      q: "What does 'Use AJAX' actually change on a view, and when would you leave it off?",
      a: "It's a per-display setting under Advanced > Other: with it on, exposed filter submissions, exposed sorts, and pager clicks replace the results region via AJAX instead of a full page reload — no JavaScript written by me. The trade-off is that core's implementation doesn't push the filter values into the address bar, so visitors can't copy a URL that reproduces their search. On a primary search page where shareable/bookmarkable URLs (and analytics on query strings) matter, I leave AJAX off; for a filterable listing block embedded in a bigger page, AJAX is usually the better experience.",
    },
  ],

  quiz: [
    {
      question:
        "What does the 'Filter identifier' setting on an exposed filter control?",
      options: [
        "The machine name of the filter plugin in views.view.*.yml",
        "The GET query-string parameter name, e.g. ?q=drupal",
        "The database column the filter queries against",
        "The CSS id of the rendered form element",
      ],
      answerIndex: 1,
      explain:
        "The identifier names the parameter in the URL. Because exposed forms submit via GET, that makes every search shareable and bookmarkable — and pager links carry the parameters along automatically.",
    },
    {
      question:
        "A visitor submits the exposed form with the optional keyword box left empty. What happens to that filter's condition?",
      options: [
        "The query errors until a value is provided",
        "Views matches only rows where the title is empty",
        "The condition is dropped from the query entirely",
        "The filter falls back to the site's default search terms",
      ],
      answerIndex: 2,
      explain:
        "A non-required exposed filter with no input contributes nothing to the WHERE clause — exactly the if ($q !== '') guard you'd hand-write in a Symfony controller, built in. Check 'Required' if the view should demand a value.",
    },
    {
      question:
        "The client wants the search form in the sidebar while results stay in the main content area. Which setting gets you there?",
      options: [
        "Advanced > Use AJAX: Yes",
        "Check 'Remember the last selection' on every filter",
        "Advanced > Exposed form in block: Yes, then place the block at Structure > Block layout",
        "Create a second view for the form and link the two by identifier",
      ],
      answerIndex: 2,
      explain:
        "'Exposed form in block' turns the view's form into a standalone block ('Exposed form: viewname-display') you place in any region. It still submits to the view's page via GET, so results and pagination keep working — no second view needed.",
    },
    {
      question:
        "Requirements: relevance-ranked fulltext search with facet counts next to each topic. What's the honest answer for a Drupal build?",
      options: [
        "Expose more title and body 'contains' filters on the core view",
        "Search API (with a database or Solr backend) plus the Facets module, rendering results through Views",
        "Better Exposed Filters, which adds relevance ranking to exposed filters",
        "A custom Symfony-style search controller inside a module",
      ],
      answerIndex: 1,
      explain:
        "Core exposed filters are LIKE queries — no ranking, stemming, or counts. Search API indexes content into a proper backend and exposes it to Views; Facets adds count-bearing facet blocks. BEF only restyles the form controls; it changes nothing about the query.",
    },
  ],
};

export default lesson;
