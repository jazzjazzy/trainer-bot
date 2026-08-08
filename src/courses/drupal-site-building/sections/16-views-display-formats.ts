import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "views-display-formats",
  title: "Display Formats: Tables, Grids & Rendered Entities",
  part: "Views: Queries Without Code",
  estMinutes: 12,
  summary:
    "Choose how a view renders with two dropdowns — Format (unformatted list, HTML list, table, grid) wraps the result set, and Show (Fields vs Content) decides whether the view composes each row or delegates it to a view mode.",

  concept: `
## Two dropdowns decide all your markup

Every Views display has a **Format** section with two rows. **Format** picks
the *style plugin* — how the whole result set is wrapped: Unformatted list,
HTML list, Table, or Grid. **Show** picks the *row plugin* — how each
individual row is produced: **Fields** (you compose it from the fields you
added) or **Content** (render the whole result entity in a view mode). In
Symfony terms: Format is the collection template, Show is the per-item
partial — except both are config, exported per display into
\`views.view.*.yml\` as \`style:\` and \`row:\`.

### The fork that matters: Fields vs Content

**Show: Fields** gives you column-level control — each field's label,
formatter, and rewrite. It's the right choice when the view IS the
presentation: tables, dashboards, admin screens, composite rewritten rows.

**Show: Content** makes Views stop composing markup entirely. Each result is
handed to the entity view builder with a view mode you pick — usually
**Teaser**. That reuses the exact \`core.entity_view_display.*\` config you
built on the Manage display tab back in section 9. The payoff is a single
source of truth: edit the Article teaser once, and the news listing, the
topic pages, and every other place articles render as teasers all change
together. If you catch yourself re-picking the same fields with the same
formatters in view after view, you wanted Content rows.

Rule of thumb: **data → Fields; documents → Content.**

### Table: the click-sortable dashboard

Choosing Table hides the Show row — a table is inherently a fields renderer;
every field becomes a column. Its Settings form is the richest in Views:

- **Sortable** per column: the header becomes a link, and clicking it re-runs
  the view with \`?order=title&sort=asc\`. No column whitelisting, no link
  building, no direction toggling.
- **Default sort**: which column and direction the table starts with — the
  \`default\` and \`order\` keys in the export.
- **Responsive** priority per column: High always shows; Medium and Low
  columns get \`priority-medium\` / \`priority-low\` classes that core's
  responsive-table JS hides on narrow screens.
- **Grouping field**: pick one of the display's fields and Views renders one
  table per distinct value, each under a heading — GROUP BY for markup.
- Plus a sticky header, caption/summary, and "show table even if empty".

### Lists and grids

**Unformatted list** is the default — minimal div wrappers, ideal under
Content rows. **HTML list** gives you a \`ul\` or \`ol\` plus class fields.
**Grid** replaces the array_chunk-and-nested-loops dance with a column count
and a horizontal/vertical fill direction.

### CSS hooks before Twig

The class fields on offer depend on the style. **HTML list** is the generous
one: a wrapper class and a list class on top of the base **row class**.
Unformatted list and Table give you the row class; Grid skips it in favour of
its own "Custom row class" (plus a custom column class). Wherever a row class
field appears, it accepts field tokens like \`{{ type }}\` when the style uses
fields, so rows can carry data-driven classes. That covers a lot of theming
before you ever override a template.

### Format settings are per display

The same view's Page display can be a sortable Table while its Block display
is a Grid of teasers. Just watch the "For: All displays / This page
(override)" dropdown at the top of every settings form before you save.
`,

  comparisons: [
    {
      label: "Table format = the sortable dashboard you'd hand-build",
      intro:
        "A content dashboard with click-sortable columns that also behaves on mobile. In Symfony that's a controller sorting whitelist plus Twig link-building; in Views it's checkboxes on the Table settings form.",
      php: `// Sortable columns by hand: whitelist, toggle, rebuild.
$allowed = ['title', 'createdAt'];
$col = in_array($request->query->get('sort'), $allowed, true)
    ? $request->query->get('sort')
    : 'createdAt';
$dir = $request->query->get('dir') === 'asc' ? 'ASC' : 'DESC';
$qb->orderBy('a.' . $col, $dir);
// Then in Twig: rebuild every header link, flip the
// direction on the active column, mark it active, and
// write your own CSS breakpoints to hide columns on
// small screens...`,
      ts: `# Format > "Table" > Settings: check "Sortable" per
# column, pick the default sort, set each column's
# Responsive priority. Exported in views.view.*.yml:
style:
  type: table
  options:
    columns:
      title: title
      created: created
      uid: uid
    default: created            # default sort column
    order: desc                 # its direction
    info:
      title:
        sortable: true
        default_sort_order: asc
        responsive: ''          # High: always visible
      created:
        sortable: true
        default_sort_order: desc
        responsive: ''
      uid:
        sortable: false
        responsive: priority-low  # hidden when narrow
    sticky: true                # header follows scroll
    empty_table: true`,
      note:
        "Clicking a sortable header re-runs the view with ?order=created&sort=desc — Views generates the links and active states, and core's responsive-table JS collapses priority-medium/priority-low columns on narrow screens.",
    },
    {
      label: "The fork: Fields rows vs Content rows (rendered entity)",
      intro:
        "Every listing needs a per-item 'teaser'. In Symfony that's a partial template that inevitably gets copied and tweaked; in Drupal, Content rows delegate to ONE view-mode definition shared with everything else.",
      php: `// Symfony: a "teaser" partial per listing...
// templates/article/_teaser.html.twig
//   <h3>{{ article.title }}</h3>
//   <p>{{ article.body|u.truncate(200) }}</p>
//
// ...until the homepage team copies and tweaks it:
// templates/home/_article_card.html.twig
//   <h2>{{ article.title }}</h2>
//   <p>{{ article.body|u.truncate(300) }}</p>
//
// Two definitions of "teaser" now drift, and every
// controller must remember which partial is current.`,
      ts: `# Format > Show: "Content" > Settings > View mode:
# Teaser. The view stops composing markup; each result
# renders through Manage display's teaser config
# (core.entity_view_display.node.article.teaser).
row:
  type: 'entity:node'
  options:
    relationship: none
    view_mode: teaser

# The Fields alternative, where YOU compose the row
# (and the Fields section reappears in the UI):
# row:
#   type: fields
#   options:
#     default_field_elements: true
#     hide_empty: false`,
      note:
        "One definition of 'teaser' lives in config; this view, other Content-rows views, and the entity's own teaser rendering all reuse it. Tables and dashboards want Fields; teaser/card listings want Content.",
    },
    {
      label: "Grid & HTML list: layout as a dropdown",
      intro:
        "A three-column card grid, or a classed ul list. The chunk-and-nest loop you'd write becomes a style plugin choice with a settings form — including your CSS class hooks.",
      php: `// A 3-column grid by hand: chunk and nest loops.
foreach (array_chunk($articles, 3) as $chunk) {
    echo '<div class="row">';
    foreach ($chunk as $a) {
        echo '<div class="col-4">'
            . $renderTeaser($a)
            . '</div>';
    }
    echo '</div>';
}
// And a separate ul builder for list pages, with
// wrapper divs and per-item classes concatenated in.`,
      ts: `# Format > "Grid" > Settings:
style:
  type: grid
  options:
    columns: 3
    automatic_width: true
    alignment: horizontal    # fill across, then wrap
    col_class_default: true
    row_class_default: true

# Or Format > "HTML list" > Settings:
# style:
#   type: html_list
#   options:
#     type: ul                 # ul | ol
#     wrapper_class: item-list
#     class: news-list         # your CSS hook
#     row_class: 'news-item {{ type }}'  # field tokens`,
      note:
        "Class fields differ per style: HTML list adds wrapper and list classes on top of the row class, while Grid swaps the base row class for its own custom row/column class fields. Row classes accept field tokens when the style uses fields — data-driven classes without touching a Twig file. Grid alignment 'vertical' fills down columns instead of across rows.",
    },
    {
      label: "Grouping field: GROUP BY for markup",
      intro:
        "Articles listed under a heading per category. Instead of bucketing rows in PHP and looping twice, pick a grouping field in the format settings — Views inserts the headings.",
      php: `// Bucket rows, then loop groups and items:
$groups = [];
foreach ($articles as $a) {
    $groups[$a->getCategory()->getName()][] = $a;
}
foreach ($groups as $heading => $items) {
    echo '<h2>' . htmlspecialchars($heading) . '</h2>';
    foreach ($items as $a) {
        echo $renderRow($a);
    }
}`,
      ts: `# Format: Table > Settings > "Grouping field Nr.1"
# > Content: Category. The dropdown offers the FIELDS
# this display already has, so add the field first
# (grouping pairs with Fields rows).
style:
  type: table
  options:
    grouping:
      -
        field: field_category
        rendered: true         # group on formatted output
        rendered_strip: false  # keep markup in headings
    columns:
      title: title
      created: created
    default: created
    order: desc`,
      note:
        "With a grouping field set, Views renders one table (or list/grid) per distinct value, each under that value's rendered heading. 'rendered: false' groups on the raw value instead.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "One result set rendered through both row styles: a Fields-composed table with a click-sortable column, then Content rows that delegate to a teaser view-mode config. Predict all four blocks of output before running.",
    code: `<?php
// One result set, two row styles. FIELDS rows: the view composes the
// output itself. CONTENT rows: each entity is handed to a view mode,
// reusing the Manage-display config from section 9.

$results = [
  ['title' => 'Tour Dates', 'created' => '2026-08-01', 'body' => 'The band hits the road this fall.'],
  ['title' => 'New Album',  'created' => '2026-07-15', 'body' => 'Twelve tracks recorded in Berlin.'],
];

// ---- FORMAT: Table, rows composed from FIELDS (dashboard) ----------
$style = [
  'columns' => ['title' => 'Title', 'created' => 'Posted'],
  'default' => 'created',                     // default sort column
  'order'   => 'desc',
  'info'    => [
    'title'   => ['sortable' => true],
    'created' => ['sortable' => true],
  ],
];

usort($results, fn($a, $b) => strcmp($b['created'], $a['created']));
echo "TABLE (default: created desc)\\n";
echo '| ' . implode(' | ', $style['columns']) . " |\\n";
foreach ($results as $r) {
  echo '| ' . $r['title'] . ' | ' . $r['created'] . " |\\n";
}

// A visitor clicks the "Title" header. Views re-runs the query with
// ?order=title&sort=asc -- only sortable columns get link headers.
$get = ['order' => 'title', 'sort' => 'asc'];
if ($style['info'][$get['order']]['sortable']) {
  usort($results, fn($a, $b) => strcmp($a[$get['order']], $b[$get['order']]));
}
echo "\\nAfter clicking Title (?order=title&sort=asc):\\n";
foreach ($results as $r) {
  echo '| ' . $r['title'] . ' | ' . $r['created'] . " |\\n";
}

// ---- FORMAT: Unformatted list, CONTENT rows (view mode: teaser) ----
// The view stops composing markup. Each row delegates to the teaser
// display -- the same config Manage display exports.
$teaser_display = [
  ['field' => 'title', 'wrap' => 'h3'],
  ['field' => 'body',  'trim' => 20],
];

echo "\\nCONTENT rows, view mode teaser:\\n";
foreach ($results as $r) {
  foreach ($teaser_display as $component) {
    $value = $r[$component['field']];
    if (isset($component['trim'])) {
      $value = substr($value, 0, $component['trim']) . '...';
    }
    if (isset($component['wrap'])) {
      $value = '<' . $component['wrap'] . '>' . $value . '</' . $component['wrap'] . '>';
    }
    echo $value . "\\n";
  }
}
echo "\\nEdit the teaser once; every CONTENT-rows view updates.\\n";`,
    output: `TABLE (default: created desc)
| Title | Posted |
| Tour Dates | 2026-08-01 |
| New Album | 2026-07-15 |

After clicking Title (?order=title&sort=asc):
| New Album | 2026-07-15 |
| Tour Dates | 2026-08-01 |

CONTENT rows, view mode teaser:
<h3>New Album</h3>
Twelve tracks record...
<h3>Tour Dates</h3>
The band hits the ro...

Edit the teaser once; every CONTENT-rows view updates.`,
  },

  keyPoints: [
    "Format picks the style plugin (Unformatted list, HTML list, Table, Grid) that wraps the result set; Show picks the row plugin (Fields vs Content); both export per display as style: and row: in views.view.*.yml.",
    "Fields rows are for views that ARE the presentation — tables, dashboards, composite rewritten rows; Content rows render each result entity in a view mode, reusing Manage display config so 'teaser' is defined exactly once.",
    "Choosing Table hides the Show row (fields become columns) and adds per-column sortable headers driven by ?order=&sort= params, a default sort column and order, responsive priorities, a sticky header, and a grouping field.",
    "Responsive priorities export as responsive: '' (always shown) or priority-medium / priority-low — core JS hides lower-priority columns on narrow screens.",
    "A grouping field (chosen from the display's fields) renders one table/list/grid per distinct value with a heading — rendered: true groups on formatted output, false on the raw value.",
    "CSS class settings vary by style — HTML list adds wrapper and list classes, most styles offer a row class (Grid via its custom row/column class fields), and field tokens are allowed in row classes when the style uses fields — and formats are set per display, so a Page can be a Table while a Block of the same view is a Grid.",
  ],

  interview: [
    {
      q: "In a Views display, when do you choose Fields rows versus Content (rendered entity) rows?",
      a: "Fields rows mean the view composes each row from individually configured fields — pick that when the view is the presentation itself: tables, admin dashboards, exports, or composite rows built with rewrites. Content rows hand each result entity to the entity view builder in a chosen view mode like Teaser, which reuses the `core.entity_view_display.*` config from the Manage display tab. That keeps display logic in one place: edit the teaser once and every listing that uses Content rows updates, along with the entity's own teaser rendering. My shorthand is data → Fields, documents → Content. Re-picking the same fields and formatters across several views is the smell that you should have used Content rows.",
    },
    {
      q: "How do you deliver a click-sortable, mobile-friendly table listing without writing a controller?",
      a: "Create a view with Format: Table — Table takes over row rendering, so each field becomes a column and the Show row disappears. In the table settings, mark columns Sortable (Views turns headers into links that re-run the query with `?order=` and `?sort=` parameters), set the default sort column and direction, and assign each column a Responsive priority — Medium and Low columns export as priority-medium/priority-low and get hidden by core's responsive-table JS on narrow screens. You also get a sticky header, an optional grouping field, and caption/empty-table settings. All of it lands in the display's `style:` options in `views.view.*.yml`, so the whole dashboard is reviewable config, not controller plus Twig plus custom CSS.",
    },
    {
      q: "One view needs to appear as a sortable table on an admin page and as a three-column grid of teasers on the homepage. One view or two, and why?",
      a: "One view, two displays — format settings live per display. The Page display gets Format: Table with sortable columns (Table implies Fields-based columns), while a second Page or Block display gets Format: Grid with 3 columns and Show: Content in Teaser mode, so the homepage cards reuse the teaser view-mode config. Shared things like filters stay on the master/default display; anything display-specific is overridden. The one discipline point is the 'For: All displays / This display (override)' dropdown at the top of each settings form — forgetting to override is the classic way to accidentally turn the admin table into a grid too.",
    },
  ],

  quiz: [
    {
      question:
        "A news listing must render each article exactly like its teaser appears elsewhere on the site, and stay in sync when the teaser changes. Which Format-section setup is right?",
      options: [
        "Show: Fields, re-adding the teaser's fields with matching formatters",
        "Show: Content with the Teaser view mode selected",
        "Format: Table with a grouping field on Content type",
        "Format: Grid with automatic width enabled",
      ],
      answerIndex: 1,
      explain:
        "Content rows delegate each result to the entity view builder in the chosen view mode, reusing core.entity_view_display.node.article.teaser from Manage display. Rebuilding the same output with Fields duplicates the display logic — it will drift the first time someone edits the teaser.",
    },
    {
      question:
        "You switch a view's Format to Table and the 'Show' row disappears from the UI. Why?",
      options: [
        "Table format is broken until you add a sort criterion",
        "Tables only work on the default display, not on pages or blocks",
        "Table is inherently a fields renderer — each field becomes a column, so there is no row-style choice",
        "You must enable aggregation before choosing a row style",
      ],
      answerIndex: 2,
      explain:
        "The table style plugin renders the display's fields as its columns, so the Fields-vs-Content choice doesn't apply — a rendered entity can't be split into sortable columns. That's also why tables pair with the Fields workflow of the previous lesson.",
    },
    {
      question:
        "In an exported table style, a column has responsive: priority-low. What does that produce?",
      options: [
        "The column loads via AJAX after the rest of the table",
        "The column gets a class that core's responsive-table JS uses to hide it on narrow screens",
        "The column is excluded from the SQL query on mobile devices",
        "The column sorts last when the user clicks its header",
      ],
      answerIndex: 1,
      explain:
        "Responsive priorities (High = always visible, Medium = priority-medium, Low = priority-low) are CSS classes on the column; core's responsive table JavaScript hides lower-priority columns as the viewport narrows. The query is unchanged — it's purely a rendering behavior.",
    },
    {
      question:
        "You want articles grouped under a heading per Category term using the table format's 'Grouping field' setting, but the dropdown is empty. What's the likely cause?",
      options: [
        "Grouping requires the Grid format, not Table",
        "The Category field hasn't been added to the display's Fields, and grouping only offers fields the display already has",
        "Grouping only works when the pager is set to 'none'",
        "You must first enable aggregation under Advanced",
      ],
      answerIndex: 1,
      explain:
        "The grouping dropdown lists the display's configured fields. Add Content: Category to Fields first (exclude it from display if you don't want it as a column), then select it as the grouping field — Views renders one table per distinct value, using the rendered output as the heading when rendered: true.",
    },
  ],
};

export default lesson;
