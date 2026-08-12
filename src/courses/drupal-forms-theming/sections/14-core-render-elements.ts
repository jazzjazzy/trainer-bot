import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "core-render-elements",
  title: "Core Render Elements: Tables, Item Lists & Pagers",
  part: "Render Arrays & the Render Pipeline",
  estMinutes: 13,
  summary:
    "Stop hand-writing markup: build the incident report as '#type' => 'table' with sticky headers, a TableSortExtender/PagerSelectExtender query, a '#type' => 'pager', and the small elements — item_list, links, html_tag, inline_template, details/container — that core already themes, overrides and translates for you.",

  concept: `
## Markup you should never write twice

In Symfony, "render a table" means opening a Twig file and typing
\`<table>\`. That's fine until three teams each type their own, none of them
adds a \`scope\` attribute, and the designer wants sticky headers everywhere.
Drupal ships the table as a **render element**: you describe the data, core
picks the template, and a theme can override that template once for the whole
site.

### #type table

\`\`\`php
$build['incidents'] = [
  '#type' => 'table',
  '#header' => [$this->t('Title'), $this->t('Severity'), $this->t('Opened')],
  '#rows' => $rows,
  '#empty' => $this->t('No incidents logged.'),
  '#sticky' => TRUE,
  '#attributes' => ['class' => ['incident-table']],
  '#caption' => $this->t('Open incidents'),
];
\`\`\`

\`#empty\` is the detail people miss — it renders a single full-width row when
\`#rows\` is empty, so you never wrap the table in an \`if\`. \`#sticky => TRUE\`
attaches \`core/drupal.tableheader\`; you don't touch libraries.yml. Each row
can be a flat array of cell values, or \`['data' => [...], 'class' => [...]]\`
when the \`<tr>\` needs attributes, and any cell can itself be a render array
(\`['data' => ['#type' => 'operations', '#links' => ...]]\` gives you core's
dropbutton).

Two upgrades come free. \`'#tableselect' => TRUE\` adds a checkbox column plus
a select-all header when the table sits inside a form. \`'#tabledrag' => [[...]]\`
turns the weight \`<select>\`s in each row into drag handles — you still add a
\`'#type' => 'weight'\` element per row and the \`draggable\` class on the row;
core attaches \`core/drupal.tabledrag\` and hides the selects. (Config entity
lists get this wholesale from \`DraggableListBuilder\`.) Use **one per table**:
\`Table::processTable()\` parents each injected checkbox at
\`[...$element['#parents'], $row_key]\`, which is exactly where a draggable row's
own child inputs live, so the two cannot share a submitted payload.

### Sorting and paging

A sortable, paged table is two query extenders and one element:

\`\`\`php
// A raw reporting table — incidents themselves are nodes.
$query = $this->database->select('incident_tracker_daily_rollup', 'r')
  ->extend(TableSortExtender::class)
  ->extend(PagerSelectExtender::class);
$rows = $query->fields('r')->orderByHeader($header)->limit(25)->execute();
\`\`\`

\`orderByHeader()\` reads \`?order=\` and \`?sort=\` — matching \`?order=\`
against the **visible header label**, not the field — and turns the header cells
that carry a \`'field'\` key into sort links. \`limit()\` registers a pager, and
a sibling \`['#type' => 'pager']\` renders it. The extenders only exist for raw
SELECTs like that rollup table; entity queries — what you use for incident
**nodes** — have the same pair built in: \`->tableSort($header)->pager(25)\`.

Both live in query arguments, so both need cache metadata — but only one half
is handled for you. \`'#type' => 'pager'\` self-declares: its \`#pre_render\`
(\`Pager::preRenderPager()\`) appends
\`'url.query_args.pagers:' . $pager['#element']\` to the pager's
\`#cache['contexts']\`, and that bubbles into the parent build, so any build that
renders a pager already varies by \`?page=\`. You only add
\`url.query_args.pagers:N\` by hand when you page **without** rendering a pager.
Nothing does the same for the sort — neither \`TableSortExtender\` nor the table
element touches cache metadata — so declare
\`'#cache' => ['contexts' => ['url.query_args:order', 'url.query_args:sort']]\`
yourself, or every visitor gets one frozen sort order.

### The rest of the toolbox

- \`'#theme' => 'item_list'\` — \`#items\`, \`#title\`, \`#list_type\` (ul/ol),
  \`#attributes\` (the one slot core actually prints, on the \`<ul>\`/\`<ol>\`),
  \`#empty\`. Items may be strings or render arrays.
- \`'#theme' => 'links'\` — \`#links\` of \`['title' =>, 'url' => Url]\`, plus
  \`#heading\`. \`'#type' => 'operations'\` is the dropbutton flavour.
- \`'#type' => 'html_tag'\` — \`#tag\`, \`#attributes\`, \`#value\`. Void
  elements close themselves; ideal for \`<meta>\` in \`#attached['html_head']\`.
- \`'#type' => 'details'\` / \`'fieldset'\` / \`'container'\` — grouping.
  \`container\` with \`'#optional' => TRUE\` disappears when it has no visible
  children.
- \`'#type' => 'inline_template'\` — a Twig string plus \`#context\`, for the
  two-line case that doesn't deserve a file.

Reach for a real template only when none of these fits.
`,

  comparisons: [
    {
      label: "A data table",
      intro:
        "Show open incidents in a table, with a friendly message when there are none. Symfony puts the markup in Twig; Drupal describes the data and lets a template it already owns emit the markup.",
      leftLang: "twig",
      rightLang: "php",
      php: `{# templates/incident/list.html.twig — you own every tag,
   including the empty state, the scope attributes and any
   sticky-header JS you decide to wire up later. #}
<table class="incident-table">
  <caption>{{ 'Open incidents'|trans }}</caption>
  <thead>
    <tr>
      <th scope="col">{{ 'Title'|trans }}</th>
      <th scope="col">{{ 'Severity'|trans }}</th>
      <th scope="col">{{ 'Opened'|trans }}</th>
    </tr>
  </thead>
  <tbody>
  {% for incident in incidents %}
    <tr>
      <td>{{ incident.title }}</td>
      <td>{{ incident.severity }}</td>
      <td>{{ incident.createdAt|date('Y-m-d') }}</td>
    </tr>
  {% else %}
    <tr><td colspan="3">{{ 'No incidents logged.'|trans }}</td></tr>
  {% endfor %}
  </tbody>
</table>`,
      ts: `<?php
// incident_tracker: a controller returns DATA, not markup.
// core/modules/system/templates/table.html.twig renders it, and
// incident_theme can override that template once, site-wide.
$rows = [];
// $incidents are nodes of bundle 'incident'.
foreach ($incidents as $incident) {
  $severity = $incident->get('field_severity')->value;
  $rows[] = [
    'data' => [
      $incident->label(),
      ['data' => $severity, 'class' => ['severity']],
      // A cell may itself be a render array.
      ['data' => [
        '#type' => 'operations',
        '#links' => [
          'edit' => ['title' => $this->t('Edit'), 'url' => $incident->toUrl('edit-form')],
        ],
      ]],
    ],
    'class' => $severity === 'critical' ? ['is-critical'] : [],
  ];
}

$build['incidents'] = [
  '#type' => 'table',
  '#caption' => $this->t('Open incidents'),
  '#header' => [$this->t('Title'), $this->t('Severity'), $this->t('Operations')],
  '#rows' => $rows,
  // Rendered as one full-width row when #rows is empty — no if ().
  '#empty' => $this->t('No incidents logged.'),
  // Attaches core/drupal.tableheader; nothing to add to libraries.yml.
  '#sticky' => TRUE,
  '#attributes' => ['class' => ['incident-table']],
];`,
      note:
        "#empty replaces the {% else %} branch, #sticky replaces a library you would otherwise write, and #type => 'operations' gives you core's accessible dropbutton. Cells accept 'data' plus arbitrary attributes; rows accept the same, which is how you colour a critical row without touching Twig.",
    },
    {
      label: "Sortable + paged, end to end",
      intro:
        "Twenty-five report rows per page, click a header to re-sort. Symfony reaches for KnpPaginatorBundle (or hand-rolls LIMIT/OFFSET plus sort links); Drupal has two query extenders and a pager element in core — shown here over a raw reporting table, because the extenders are for raw SELECTs (incident nodes get the same pair from an entity query).",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony: a bundle supplies the paginator and the sort links.
// composer require knplabs/knp-paginator-bundle
namespace App\\Controller;

use Knp\\Component\\Pager\\PaginatorInterface;
use Symfony\\Component\\HttpFoundation\\Request;

final class IncidentController extends AbstractController
{
    public function list(
        Request $request,
        IncidentRepository $repo,
        PaginatorInterface $paginator,
    ): Response {
        $pagination = $paginator->paginate(
            $repo->createQueryBuilder('i'),      // not executed yet
            $request->query->getInt('page', 1),
            25,
        );

        return $this->render('incident/list.html.twig', [
            'pagination' => $pagination,
        ]);
    }
}

// list.html.twig — sort links and the pager come from the bundle:
//   <th>{{ knp_pagination_sortable(pagination, 'Severity'|trans, 'i.severity') }}</th>
//   {{ knp_pagination_render(pagination) }}
// Caching correctly per ?page/?sort is your problem.`,
      ts: `<?php
// Drupal: both extenders are core. The header cells carrying a
// 'field' key become the sort links.
use Drupal\\Core\\Database\\Query\\PagerSelectExtender;
use Drupal\\Core\\Database\\Query\\TableSortExtender;

public function report(): array {
  $header = [
    ['data' => $this->t('Day'),       'field' => 'r.day'],
    // 'sort' marks the DEFAULT column and direction.
    ['data' => $this->t('Severity'),  'field' => 'r.severity', 'sort' => 'desc'],
    ['data' => $this->t('Incidents'), 'field' => 'r.total'],
  ];

  // A reporting/aggregation table, NOT the incident entity: incidents are
  // nodes, and node data is read through an entity query (see below).
  $result = $this->database->select('incident_tracker_daily_rollup', 'r')
    ->extend(TableSortExtender::class)
    ->extend(PagerSelectExtender::class)
    ->fields('r', ['day', 'severity', 'total'])
    // Reads ?order= (matched against the header LABEL) and ?sort=.
    ->orderByHeader($header)
    // Registers pager element 0 and applies LIMIT/OFFSET.
    ->limit(25)
    ->execute();

  $rows = [];
  foreach ($result as $record) {
    $rows[] = [$record->day, $record->severity, $record->total];
  }

  return [
    'table' => [
      '#type' => 'table',
      '#header' => $header,
      '#rows' => $rows,
      '#empty' => $this->t('No incidents logged.'),
    ],
    // Renders pager element 0. #quantity defaults to 9 page links.
    // Pager::preRenderPager() puts 'url.query_args.pagers:0' on THIS
    // element and it bubbles up — paging is already cache-correct.
    'pager' => ['#type' => 'pager', '#element' => 0],
    '#cache' => [
      'contexts' => [
        // Nothing declares these: TableSortExtender rewrites the query,
        // not the cache metadata. Miss them and every visitor gets the
        // same sort order.
        'url.query_args:order',
        'url.query_args:sort',
      ],
      // The rollup is derived from incident nodes, so it goes stale
      // whenever one is created, edited or deleted.
      'tags' => ['node_list:incident'],
    ],
  ];
}

// Entity queries get the same pair, no extenders needed — this is how
// you page and sort the incident NODES themselves:
//   $storage->getQuery()->accessCheck(TRUE)
//     ->condition('type', 'incident')
//     ->tableSort($header)   // takes $header by reference
//     ->pager(25);`,
      note:
        "extend() wraps the query and proxies unknown methods, so the chain order of TableSortExtender/PagerSelectExtender doesn't matter. The page and the sort both live in query arguments, but only the page is handled for you: Pager::preRenderPager() adds url.query_args.pagers:N to the pager element's cache contexts and that bubbles into the parent build, so rendering a '#type' => 'pager' already varies the output by ?page= (declare it by hand only if you page without rendering a pager). TableSortExtender adds no cache metadata at all, so url.query_args:order and url.query_args:sort are yours — omit them and Dynamic Page Cache hands every visitor the same sort order.",
    },
    {
      label: "Checkboxes and drag handles",
      intro:
        "Bulk-close incidents and re-order the triage queue. In Symfony that's a form collection plus a JS sortable library you install and wire; in Drupal each is a flag on a '#type' => 'table' — one flag per table, because the two fight over the same #parents.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony: hand-build the selection form, then hand-build the
// re-order UI. Nothing about the <table> is provided for you.
namespace App\\Form;

use Symfony\\Component\\Form\\AbstractType;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\CheckboxType;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\CollectionType;
use Symfony\\Component\\Form\\Extension\\Core\\Type\\HiddenType;

final class IncidentTriageType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('selected', CollectionType::class, [
                'entry_type' => CheckboxType::class,
                'allow_add' => true,
            ])
            ->add('positions', CollectionType::class, [
                'entry_type' => HiddenType::class,
                'allow_add' => true,
            ]);
    }
}

// Plus: a "select all" checkbox in Twig + its JS,
// plus SortableJS (npm/Encore) writing into the hidden inputs,
// plus the drag-handle markup and its keyboard fallback.`,
      ts: `<?php
// Drupal: '#tableselect' and '#tabledrag' are one-line flags — but on
// TWO tables, not one. Table::processTable() parents each injected
// checkbox at [...$element['#parents'], $row_key], i.e. ['order', 3],
// which is exactly where a draggable row's own inputs live
// (['order', 3, 'weight']). Core's #type table docs show them together
// "only for brevity"; combined, the payload collides and
// Table::valueCallback()'s array_combine() gets an array value.
public function buildForm(array $form, FormStateInterface $form_state): array {
  // 1. Bulk operations: #tableselect + display-only children.
  //    Core attaches core/drupal.tableselect and adds select-all.
  $form['selection'] = [
    '#type' => 'table',
    '#header' => [$this->t('Incident'), $this->t('Severity')],
    '#empty' => $this->t('Nothing to triage.'),
    '#tableselect' => TRUE,
  ];
  // queue() returns incident nodes keyed by node id.
  foreach ($this->triage->queue() as $id => $incident) {
    // No '#type' inputs in these rows — the checkbox owns ['selection', $id].
    $form['selection'][$id]['title'] = ['#markup' => $incident->label()];
    $form['selection'][$id]['severity'] = [
      '#markup' => $incident->get('field_severity')->value,
    ];
  }

  // 2. Re-ordering: #tabledrag + a real input per row, no #tableselect.
  //    Core attaches core/drupal.tabledrag, hides the weight selects
  //    behind handles, and keeps the keyboard fallback.
  $form['order'] = [
    '#type' => 'table',
    '#header' => [$this->t('Incident'), $this->t('Weight')],
    '#empty' => $this->t('Nothing to triage.'),
    // Drag handles that write into the .incident-weight selects.
    '#tabledrag' => [[
      'action' => 'order',
      'relationship' => 'sibling',
      'group' => 'incident-weight',
    ]],
  ];
  foreach ($this->triage->queue() as $id => $incident) {
    $weight = $this->triage->getWeight($id);
    $form['order'][$id]['#attributes']['class'][] = 'draggable';
    $form['order'][$id]['#weight'] = $weight;
    $form['order'][$id]['title'] = ['#markup' => $incident->label()];
    $form['order'][$id]['weight'] = [
      '#type' => 'weight',
      '#title' => $this->t('Weight for @title', ['@title' => $incident->label()]),
      '#title_display' => 'invisible',
      '#default_value' => $weight,
      // MUST match the #tabledrag 'group'.
      '#attributes' => ['class' => ['incident-weight']],
    ];
  }
  return $form;
}

public function submitForm(array &$form, FormStateInterface $form_state): void {
  // #tableselect table: Table::valueCallback() runs array_combine() over
  // the raw input, and unchecked boxes never post — so the value is just
  // the checked row keys, keyed by themselves.
  $selected = array_keys($form_state->getValue('selection'));

  // #tabledrag table: keyed by row id, each row an array of ITS children.
  foreach ($form_state->getValue('order') as $id => $row) {
    $this->triage->setWeight($id, (int) $row['weight']);
  }
}`,
      note:
        "The 'group' in #tabledrag and the class on the '#type' => 'weight' element must be the same string — that mismatch is the number-one reason drag handles never appear. Keep the two features on separate tables: #tableselect's injected checkbox claims ['<table>', $row_key] as its #parents, the same slot a draggable row's child inputs sit under, so a combined table posts incidents[3] and incidents[3][weight] at once. If you genuinely need select-and-drag in one table, hand-roll an ordinary '#type' => 'checkbox' child per row instead of setting #tableselect. A standalone '#type' => 'tableselect' (with #options keyed by row id, #header, #js_select) covers the read-only 'pick some rows' case; config entity lists get the whole drag pattern from DraggableListBuilder.",
    },
    {
      label: "Lists, links, tags and one-line Twig",
      intro:
        "The small markup you'd otherwise scatter across Twig files. Each of these is themeable and overridable, which a hard-coded <ul> in a template is not.",
      leftLang: "twig",
      rightLang: "php",
      php: `{# Symfony: every one of these is literal markup in a Twig file
   (or a macro you maintain). Overriding them site-wide means
   editing every call site. #}

<div class="incident-actions">
  <h3>{{ 'Actions'|trans }}</h3>
  <ol>
    {% for action in actions %}
      <li class="action"><a href="{{ path(action.route) }}">{{ action.label }}</a></li>
    {% endfor %}
  </ol>
</div>

<meta name="incident-count" content="{{ incidents|length }}">

<details open>
  <summary>{{ 'Advanced filters'|trans }}</summary>
  {{ form_row(form.severity) }}
</details>

{# A one-liner still needs its own file, or an {% embed %}. #}
{% include 'incident/_badge.html.twig' with { level: 'critical' } %}`,
      ts: `<?php
// Drupal: five elements, all themeable, all translatable,
// all overridable once in incident_theme.
$build['actions'] = [
  '#theme' => 'item_list',
  '#title' => $this->t('Actions'),
  '#list_type' => 'ol',
  '#items' => $links,                       // strings OR render arrays
  '#empty' => $this->t('No actions available.'),
  // The only attribute slot core prints: lands on the <ol>/<ul>.
  '#attributes' => ['class' => ['actions-list']],
  // Preprocessed into a wrapper_attributes Attribute object, but core's
  // item-list.html.twig never prints it — dead weight unless a theme
  // overrides the template and emits a wrapper itself.
  '#wrapper_attributes' => ['class' => ['incident-actions']],
];

$build['nav'] = [
  '#theme' => 'links',
  '#heading' => ['text' => $this->t('Related'), 'level' => 'h3'],
  '#links' => [
    'all' => ['title' => $this->t('All incidents'), 'url' => Url::fromRoute('incident_tracker.list')],
  ],
];

// html_tag knows the void elements; great for #attached['html_head'].
$build['#attached']['html_head'][] = [[
  '#type' => 'html_tag',
  '#tag' => 'meta',
  '#attributes' => ['name' => 'incident-count', 'content' => (string) $count],
], 'incident_count'];

$build['filters'] = [
  '#type' => 'details',
  '#title' => $this->t('Advanced filters'),
  '#open' => TRUE,
  'severity' => $severity_element,
];

// A two-line template that doesn't deserve a file.
$build['badge'] = [
  '#type' => 'inline_template',
  '#template' => '<span class="badge badge--{{ level }}">{{ label }}</span>',
  '#context' => ['level' => 'critical', 'label' => $this->t('Critical')],
];`,
      note:
        "item_list looks like it has two attribute slots but only has one that works: #attributes lands on the <ul>/<ol>. ThemePreprocess::preprocessItemList() does build a wrapper_attributes Attribute object from #wrapper_attributes, yet core's item-list.html.twig emits only an optional <h3>{{ title }}</h3> followed by <{{ list_type }}{{ attributes }}> — there is no wrapper element — so #wrapper_attributes produces zero output on a stock site and only matters once a theme overrides the template and prints it. inline_template runs the string through the normal Twig environment, so autoescaping and filters still apply — but it can't be overridden by a theme, so keep it to throwaway markup.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A miniature version of the pipeline in pure PHP: resolve the tablesort column from ?order= and ?sort= the way TableSortExtender::orderByHeader() does, slice the rows the way PagerSelectExtender::limit() does, then render '#type' => 'table' (with and without rows), an item_list whose items you sort yourself (core does NOT weight-sort #items), and an html_tag. Two things to predict: which column wins the sort — and, since severity is a list_string, that ASC orders it alphabetically (critical, high, low) rather than by impact — and what the table emits when #rows is empty.",
    code: `<?php
// A miniature render pipeline for core's data elements: resolve the
// tablesort header from query args, page the rows, then render
// '#type' => 'table' / 'item_list' / 'html_tag'.

// Fake request: /admin/reports/incidents?order=Severity&sort=asc&page=1
$query = ['order' => 'Severity', 'sort' => 'asc', 'page' => '1'];

$header = [
    ['data' => 'Title',    'field' => 'title'],
    ['data' => 'Severity', 'field' => 'severity', 'sort' => 'desc'], // default sort
    ['data' => 'Opened',   'field' => 'created'],
];

// field_severity is a list_string: 'low' | 'high' | 'critical'. Sorting a
// string column ASC is alphabetical — critical, high, low — not by impact.
$incidents = [
    ['title' => 'DB replica lag',   'severity' => 'critical', 'created' => '2026-05-02'],
    ['title' => 'Queue backlog',    'severity' => 'low',      'created' => '2026-05-04'],
    ['title' => 'Slow admin pages', 'severity' => 'high',     'created' => '2026-05-01'],
    ['title' => 'Stale /status',    'severity' => 'high',     'created' => '2026-05-06'],
    ['title' => 'Cron never fires', 'severity' => 'low',      'created' => '2026-05-07'],
];

/** What TableSortExtender::orderByHeader() does with ?order= and ?sort=. */
function order_by_header(array $header, array $query): array {
    $default = NULL;
    foreach ($header as $cell) {
        if (!isset($cell['field'])) {
            continue;
        }
        if (isset($cell['sort']) && $default === NULL) {
            $default = ['field' => $cell['field'], 'sort' => $cell['sort']];
        }
        // ?order= is matched against the VISIBLE header label, not the field.
        if (isset($query['order']) && $query['order'] === $cell['data']) {
            $dir = (isset($query['sort']) && strtolower($query['sort']) === 'desc') ? 'desc' : 'asc';
            return ['field' => $cell['field'], 'sort' => $dir];
        }
    }
    return $default ?? ['field' => $header[0]['field'], 'sort' => 'asc'];
}

$order = order_by_header($header, $query);
echo "ORDER BY {$order['field']} {$order['sort']}\\n";

usort($incidents, function (array $a, array $b) use ($order): int {
    $cmp = $a[$order['field']] <=> $b[$order['field']];
    return $order['sort'] === 'desc' ? -$cmp : $cmp;
});

// PagerSelectExtender::limit(2) on pager element 0.
$limit = 2;
$page  = (int) ($query['page'] ?? 0);
$total = count($incidents);
$pages = (int) ceil($total / $limit);
$rows  = array_slice($incidents, $page * $limit, $limit);
echo "pager: page " . ($page + 1) . " of {$pages} ({$total} rows, limit {$limit})\\n\\n";

/** A tiny renderer for three core elements. */
function render_element(array $el): string {
    $type = $el['#type'] ?? $el['#theme'] ?? '';
    $attr = '';
    foreach ($el['#attributes'] ?? [] as $name => $value) {
        $attr .= ' ' . $name . '="' . (is_array($value) ? implode(' ', $value) : $value) . '"';
    }

    if ($type === 'html_tag') {
        return '<' . $el['#tag'] . $attr . '>' . ($el['#value'] ?? '') . '</' . $el['#tag'] . '>';
    }

    if ($type === 'item_list') {
        $tag = $el['#list_type'] ?? 'ul';
        // No sorting here, on purpose: preprocessItemList() walks #items
        // in the order it was given. #weight only sorts a render array's
        // CHILDREN, and #items is a property, not children.
        $items = $el['#items'];
        $out = "<{$tag}{$attr}>";
        foreach ($items as $item) {
            $out .= '<li>' . (is_array($item) ? ($item['#markup'] ?? '') : $item) . '</li>';
        }
        return $out . "</{$tag}>";
    }

    if ($type === 'table') {
        if ($el['#rows'] === []) {
            // #empty is why you never write an if () around the table.
            return '<table' . $attr . '><tbody><tr class="odd"><td colspan="'
                . count($el['#header']) . '" class="empty message">'
                . $el['#empty'] . '</td></tr></tbody></table>';
        }
        $out = '<table' . $attr . '><thead><tr>';
        foreach ($el['#header'] as $cell) {
            $out .= '<th>' . $cell['data'] . '</th>';
        }
        $out .= '</tr></thead><tbody>';
        foreach ($el['#rows'] as $row) {
            $out .= '<tr><td>' . implode('</td><td>', $row) . '</td></tr>';
        }
        return $out . '</tbody></table>';
    }

    return '';
}

$table = [
    '#type'       => 'table',
    '#header'     => $header,
    '#rows'       => array_map(fn ($i) => [$i['title'], $i['severity'], $i['created']], $rows),
    '#empty'      => 'No incidents logged.',
    '#sticky'     => TRUE,
    '#attributes' => ['class' => ['incident-table']],
];
echo render_element($table) . "\\n\\n";

// Same element, zero rows.
echo render_element([
    '#type'   => 'table',
    '#header' => $header,
    '#rows'   => [],
    '#empty'  => 'No incidents logged.',
]) . "\\n\\n";

// The Renderer sorts a render array's CHILDREN by #weight
// (Element::children($elements, TRUE)). item_list's #items is a
// PROPERTY, not children, and preprocessItemList() does not sort it —
// so a weighted list is a list YOU sort before building #items.
// Handed to core unsorted, this would render Close, Edit, Assign.
$actions = [
    'close'  => ['#markup' => 'Close',  '#weight' => 10],
    'edit'   => ['#markup' => 'Edit',   '#weight' => -10],
    'assign' => ['#markup' => 'Assign'],
];
uasort($actions, fn ($a, $b) => ($a['#weight'] ?? 0) <=> ($b['#weight'] ?? 0));

echo render_element([
    '#theme'      => 'item_list',
    '#list_type'  => 'ol',
    '#attributes' => ['class' => ['incident-actions']],
    '#items'      => $actions,
]) . "\\n";
echo render_element([
    '#type'       => 'html_tag',
    '#tag'        => 'p',
    '#attributes' => ['class' => ['help']],
    '#value'      => '#sticky attaches core/drupal.tableheader for you.',
]) . "\\n\\n";

// What this page varies on. The pagers context is added for you by
// Pager::preRenderPager() whenever a '#type' => 'pager' is rendered and
// bubbles up; the order/sort pair is declared by nobody but you.
print_r(['contexts' => ['url.query_args.pagers:0', 'url.query_args:order', 'url.query_args:sort']]);`,
    output: `ORDER BY severity asc
pager: page 2 of 3 (5 rows, limit 2)

<table class="incident-table"><thead><tr><th>Title</th><th>Severity</th><th>Opened</th></tr></thead><tbody><tr><td>Stale /status</td><td>high</td><td>2026-05-06</td></tr><tr><td>Queue backlog</td><td>low</td><td>2026-05-04</td></tr></tbody></table>

<table><tbody><tr class="odd"><td colspan="3" class="empty message">No incidents logged.</td></tr></tbody></table>

<ol class="incident-actions"><li>Edit</li><li>Assign</li><li>Close</li></ol>
<p class="help">#sticky attaches core/drupal.tableheader for you.</p>

Array
(
    [contexts] => Array
        (
            [0] => url.query_args.pagers:0
            [1] => url.query_args:order
            [2] => url.query_args:sort
        )

)
`,
  },

  keyPoints: [
    "'#type' => 'table' takes #header, #rows, #empty (a full-width message row instead of an if()), #sticky (auto-attaches core/drupal.tableheader), #caption and #attributes; rows and cells accept ['data' => ..., 'class' => ...] and any cell can hold a nested render array such as '#type' => 'operations'.",
    "Sortable + paged is TableSortExtender + PagerSelectExtender: header cells with a 'field' key become sort links, 'sort' => 'desc' marks the default column, orderByHeader() reads ?order= (matched against the header LABEL) and ?sort=, limit() registers the pager, and a sibling ['#type' => 'pager', '#element' => 0] renders it. Entity queries use ->tableSort($header)->pager(25).",
    "Paged/sorted output varies by query arguments, but only paging is handled for you: '#type' => 'pager' adds url.query_args.pagers:N to its own #cache['contexts'] in Pager::preRenderPager(), and that bubbles into the parent build. Nothing declares url.query_args:order / url.query_args:sort — add those yourself (plus the pagers context by hand if you page without rendering a pager) or Dynamic Page Cache serves one sort order to everyone.",
    "'#tableselect' => TRUE adds a checkbox column with select-all inside a form; '#tabledrag' plus a per-row '#type' => 'weight' element whose class matches the tabledrag 'group', plus the 'draggable' class on each row, gives drag-to-reorder — DraggableListBuilder packages the same pattern for config entity lists. Use one flag per table: processTable() parents the injected checkbox at [...#parents, $row_key], colliding with a draggable row's own child inputs.",
    "item_list (#items, #title, #list_type, and #attributes on the ul/ol — #wrapper_attributes is passed to the template but core's item-list.html.twig prints no wrapper element, so it does nothing unless a theme overrides the template), links (#links + #heading), html_tag (#tag/#attributes/#value, void-element aware), and details/fieldset/container (#open, #optional) cover almost all remaining markup.",
    "'#type' => 'inline_template' runs a Twig string with #context through the normal environment — handy for two-liners, but unlike a #theme hook a theme cannot override it, so don't build a UI out of it.",
  ],

  interview: [
    {
      q: "Why use '#type' => 'table' instead of writing the table markup in a Twig template?",
      a: "Because the render array is data, and data can be altered, themed and reused; markup in a template is a dead end. A table element gets `#empty`, `#sticky` (which attaches `core/drupal.tableheader` for you), `#caption`, per-row and per-cell attributes, and `#tableselect`/`#tabledrag` as flags rather than as JavaScript you install. It also renders through `table.html.twig`, so `incident_theme` can override the markup once and every table on the site follows — including core's own admin tables. And because the build is still an array when hooks run, another module can add a column in `hook_preprocess_table()` or alter the rows before render, which is impossible once you've concatenated strings in Twig.",
    },
    {
      q: "Build me a sortable, paged report of incidents. What do you write?",
      a: "A `$header` array where each sortable cell is `['data' => $this->t('Severity'), 'field' => 'i.severity']`, with `'sort' => 'desc'` on the column that should be the default. Then a select query extended with `TableSortExtender` and `PagerSelectExtender`, calling `->orderByHeader($header)` and `->limit(25)`. Render a `'#type' => 'table'` with that same `$header` — that's what turns the labels into sort links — and a sibling `['#type' => 'pager', '#element' => 0]`. On an entity query it's the same idea without extenders: `->tableSort($header)->pager(25)`. Finally I'd add `url.query_args:order` and `url.query_args:sort` to the build's cache contexts — nothing declares those for me, so without them the render cache serves one sort order under every URL. Paging is already covered: `Pager::preRenderPager()` puts `url.query_args.pagers:0` on the pager element and it bubbles up into the build, so I'd only declare that one by hand if I paged without rendering a pager.",
    },
    {
      q: "How does Drupal's table element compare with what you'd reach for in Symfony, and when would you still write a template?",
      a: "In Symfony I'd write the `<table>` in Twig and pull in something like KnpPaginatorBundle for paging and sort links; the empty state, the sticky headers, the select-all checkbox and any drag-to-reorder are all mine to build and maintain. Drupal ships all of that in core as element properties, and the theme layer can override the output globally. I'd still write a template when the structure genuinely isn't a table, a list or a set of links — a bespoke card layout, say — and then I'd register a `#theme` hook in `hook_theme()` with a preprocess function so it stays overridable, rather than hard-coding markup in a controller. `'#type' => 'inline_template'` is the middle ground for a two-line snippet, with the caveat that a theme can't override it.",
    },
    {
      q: "A colleague's drag-and-drop table renders plain weight dropdowns with no drag handles. How do you debug it?",
      a: "Almost always the `'group'` key in `#tabledrag` doesn't match the class on the per-row `'#type' => 'weight'` element — core hides the selects and shows handles only for the group it can find. I'd check three things in order: the group string matches the weight element's `#attributes['class']` exactly; every draggable row has `'draggable'` in `$form['table'][$id]['#attributes']['class']`; and the table is actually a `'#type' => 'table'` inside a form, not a `'#theme' => 'table'` (the theme hook takes `#rows` and has no tabledrag support at all). If those are right, look for JS aggregation errors — `core/drupal.tabledrag` is attached by the element, so if it isn't in the page something is unsetting `#attached`.",
    },
  ],

  quiz: [
    {
      question:
        "Your incident report has zero rows. What is the cleanest way to show 'No incidents logged.'?",
      options: [
        "Wrap the table in if (!empty($rows)) and render a separate #markup element otherwise",
        "Set '#empty' on the '#type' => 'table' element — core renders it as a single full-width row",
        "Return an empty array; Drupal shows the site's default empty message",
        "Override table.html.twig in incident_theme and add an {% else %} branch",
      ],
      answerIndex: 1,
      explain:
        "#empty exists precisely so the build stays branch-free: when #rows is empty, table.html.twig emits one row spanning all columns containing the #empty value. The if() version duplicates logic everywhere, and overriding the template to add an else branch reimplements what core already does.",
    },
    {
      question:
        "You add TableSortExtender and PagerSelectExtender to the query and render a table plus a pager. Paging works fine, but everyone sees the same sort column no matter which header they click. What's missing?",
      options: [
        "'#element' => 0 on the pager element",
        "A 'sort' key on one of the header cells",
        "url.query_args:order and url.query_args:sort in the build's #cache['contexts']",
        "->limit() must be called before ->orderByHeader()",
      ],
      answerIndex: 2,
      explain:
        "The sort lives entirely in ?order= and ?sort=, and nothing declares those contexts for you — TableSortExtender rewrites the query, not the cache metadata — so one cached variation is reused across every sort URL. Paging works in this build precisely because it IS declared for you: Pager::preRenderPager() appends url.query_args.pagers:0 to the pager element's contexts and that bubbles into the parent build. #element defaults to 0 anyway, and the extender chain order is irrelevant because extend() proxies method calls to the wrapped query.",
    },
    {
      question:
        "In a #tabledrag table, which pair of strings must match exactly for drag handles to appear?",
      options: [
        "The table's #attributes class and the form ID",
        "The #tabledrag 'group' and the class on each row's '#type' => 'weight' element",
        "The #tabledrag 'relationship' and the row key",
        "The #header label and the weight element's #title",
      ],
      answerIndex: 1,
      explain:
        "core/drupal.tabledrag finds the weight selects by the class named in the 'group' key, hides them and injects handles. A typo there produces exactly the symptom of visible dropdowns and no handles. Each draggable row also needs 'draggable' in its #attributes classes.",
    },
    {
      question:
        "Which element should you NOT use for markup a theme may need to override later?",
      options: [
        "'#theme' => 'item_list'",
        "'#type' => 'table'",
        "'#type' => 'inline_template'",
        "'#theme' => 'links'",
      ],
      answerIndex: 2,
      explain:
        "inline_template renders a Twig string that lives in your PHP, so there is no template file for incident_theme to override and no #theme hook to add suggestions to. It's fine for a throwaway two-liner; anything a designer will want to restyle structurally belongs in a real #theme hook (item_list, links, table, or your own registered in hook_theme()).",
    },
  ],
};

export default lesson;
