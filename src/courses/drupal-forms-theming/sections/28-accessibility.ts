import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "accessibility",
  title: "Accessibility in Drupal Output",
  part: "Quality & Debugging",
  estMinutes: 12,
  summary:
    "Core ships landmarks, a skip link, .visually-hidden, fieldset/legend, aria-describedby on descriptions and a live region — so in Drupal your accessibility job is mostly to override templates without deleting any of it, plus the handful of things (#title_display, #alt, Drupal.announce) you still have to get right yourself.",

  concept: `
## Symfony hands you a blank page; Drupal hands you a contract

In Symfony you start from an empty \`base.html.twig\`. Every landmark, every
\`<label>\`, every live region is yours to invent — and yours to forget. Drupal
inverts that: core's templates already carry a skip link, landmark roles,
\`fieldset\`/\`legend\` for radio groups, \`aria-describedby\` wiring and an
\`aria-live\` region. The consequence is uncomfortable but useful: **most Drupal
accessibility bugs are deletions**. Someone started a template override from a
blank file instead of copying core's, and a screen-reader affordance went with it.

### What core already ships

- **Skip link.** \`html.html.twig\` renders
  \`<a href="#main-content" class="visually-hidden focusable skip-link">\`;
  \`page.html.twig\` provides the \`<a id="main-content" tabindex="-1"></a>\`
  target. Drop that anchor from your override and the skip link jumps nowhere.
- **The hiding classes.** \`.hidden\`, \`.visually-hidden\`,
  \`.visually-hidden.focusable\` and \`.invisible\` come from
  \`hidden.module.css\` in the \`system/base\` library — present on every page,
  no library attach needed. \`focusable\` is the one that reveals on tab.
- **Landmarks.** Olivero and Claro emit \`role="banner"\`, \`role="main"\`,
  \`role="contentinfo"\` and labelled \`<nav>\` elements in their page templates.
- **Messages.** \`status-messages.html.twig\` wraps each group in
  \`role="contentinfo" aria-label="Error message"\` and puts errors inside an
  extra \`<div role="alert">\`, while the region carries \`data-drupal-messages\`
  so \`Drupal.Message\` can inject after an Ajax response.

### The form rules you own

\`#title\` **is** the label — a placeholder is not a label. When the design has no
visible label, use \`'#title_display' => 'invisible'\` (still a real
\`<label class="visually-hidden">\`), never an empty \`#title\`.
\`'attribute'\` puts the text in \`title=\` and emits no label at all.

\`#description\` renders with \`id="ELEMENTID--description"\` and the input points
at it with \`aria-describedby\`; if you override \`form-element.html.twig\` and
drop \`{{ description.attributes }}\`, that id vanishes and the reference dangles.
\`'#description_display' => 'invisible'\` keeps the text announced while hiding it.

Radios and checkboxes render as \`fieldset\` + \`legend\` — that legend is the
group's name. Swapping it for a \`container\` plus an \`<h3>\` loses it.
Validation errors reach the messages region (announced via \`role="alert"\`) and
mark the input \`aria-invalid="true"\`; core's **Inline Form Errors** module
renders each message next to its own field (the \`errors\` variable in
\`form-element.html.twig\`) and replaces the individual messages with a single
linked summary in the messages region. It does *not* fold those errors into
\`aria-describedby\` — the only \`aria-describedby\` core wires up automatically
is \`FormBuilder\`'s \`#description\` -> \`{id}--description\`.

### JavaScript, images, CSS

Anything your JS changes without a page load must be spoken:
\`Drupal.announce(Drupal.t('12 incidents found.'))\`, with
\`core/drupal.announce\` in your library's dependencies. Pass \`'assertive'\` as
the second argument only for genuinely urgent messages.

\`'#theme' => 'image'\` takes \`#alt\`: a real string, or \`''\` for decorative.
The \`image\` theme hook (and \`image_style\`) declares \`'alt' => ''\` as the
**default** variable, so merely omitting \`#alt\` still emits \`alt=""\` — already
the decorative case. The genuinely dangerous value is \`'#alt' => NULL\`, the
documented way to drop the attribute entirely; with no \`alt\` at all screen
readers fall back to reading the filename. Say \`'#alt' => ''\` on purpose rather
than relying on the default, so the next developer can see you decided.
Claro and Olivero already meet WCAG AA contrast and ship
\`:focus-visible\` outlines; a subtheme that sets \`outline: none\` undoes both.

### Testing

Tab through the page first — keyboard-only finds more than any scanner. Then run
axe DevTools or Lighthouse, and Nightwatch's axe-backed tests if you have them.
Core's own **accessibility gate** requires WCAG 2.1 AA (and ATAG 2.0 for the
authoring UI) for every core patch; holding your module to the same bar is a
credible answer in an interview.
`,

  comparisons: [
    {
      label: "A search box with no visible label",
      intro:
        "The designer's comp shows a magnifier and a placeholder, no label text. Both frameworks can produce that; only one of them makes the accessible version the path of least resistance.",
      php: `// Symfony: nothing enforces a label, and "hide it visually" is a
// convention you invent (and re-invent) per project.
$builder->add('q', SearchType::class, [
  'label' => 'Filter incidents',
  'label_attr' => ['class' => 'sr-only'],      // your class, your CSS
  'attr' => [
    'placeholder' => 'Filter incidents',
    'aria-describedby' => 'q-help',            // id you must keep in sync
  ],
  'help' => 'Matches title and reporter.',
]);

// The temptation, and what teams actually ship:
// $builder->add('q', SearchType::class, ['label' => false, ...]);
// -> an <input> with no accessible name at all.`,
      ts: `// Drupal: #title IS the label. Hide it; never delete it.
$form['q'] = [
  '#type' => 'search',
  '#title' => $this->t('Filter incidents'),
  '#title_display' => 'invisible',   // <label class="visually-hidden">
  '#placeholder' => $this->t('Filter incidents'),
  '#description' => $this->t('Matches title and reporter.'),
  '#description_display' => 'invisible', // announced, not shown
];

// 'before' (default) | 'after' | 'invisible' | 'attribute'
// 'attribute' emits title="..." and NO <label> — only for
// icon-sized controls where a label cannot exist.`,
      note: "'invisible' keeps a real <label for=...> in the DOM wearing core's .visually-hidden class, so the input still has an accessible name. #description gets id=\"edit-q--description\" and the input's aria-describedby is wired to it for free.",
    },
    {
      label: "Landmarks and the skip link",
      intro:
        "Overriding page.html.twig is routine. Starting that override from an empty file is how a site loses its skip-link target and its landmark roles in one commit.",
      php: `{# Symfony templates/base.html.twig — you author all of this,
   and every new project starts from nothing again. #}
<body>
  <a href="#main" class="skip-link">Skip to main content</a>

  <header role="banner">{% block header %}{% endblock %}</header>

  <nav aria-label="Main navigation">{% block nav %}{% endblock %}</nav>

  <main id="main" tabindex="-1">
    {% block body %}{% endblock %}
  </main>

  <footer role="contentinfo">{% block footer %}{% endblock %}</footer>
</body>`,
      ts: `{# incident_theme/templates/layout/page.html.twig
   Copied from the base theme, then edited. The skip link itself
   lives in html.html.twig; this file only owns its target. #}
<header role="banner">
  {{ page.header }}
  {{ page.primary_menu }}
</header>

{# Keep this. html.html.twig links to #main-content. #}
<a id="main-content" tabindex="-1"></a>

<main role="main">
  <div class="layout-content">
    {{ page.highlighted }}
    {{ page.content }}
  </div>
  {% if page.sidebar_first %}
    <aside class="layout-sidebar-first" role="complementary">
      {{ page.sidebar_first }}
    </aside>
  {% endif %}
</main>

<footer role="contentinfo">{{ page.footer }}</footer>`,
      note: "Rule: copy the template you are overriding (from core/themes/olivero, claro, or core/themes/stable9) into incident_theme and edit it — never write a page/region/form template from scratch.",
      leftLang: "twig",
      rightLang: "twig",
    },
    {
      label: "Announcing a change the user cannot see happen",
      intro:
        "Filtering the incident list client-side updates the DOM silently. A sighted user sees the rows change; a screen-reader user hears nothing unless you say something.",
      php: `// Symfony + Encore: build and manage the live region yourself.
let region = document.getElementById('live-region');
if (!region) {
  region = document.createElement('div');
  region.id = 'live-region';
  region.className = 'sr-only';
  region.setAttribute('aria-live', 'polite');
  document.body.appendChild(region);
}

document.querySelector('#severity').addEventListener('change', async (e) => {
  const rows = await fetchIncidents(e.target.value);
  renderRows(rows);
  // No debounce: rapid changes stomp each other mid-announcement.
  region.textContent = rows.length + ' incidents found.';
});`,
      ts: `// Drupal: #drupal-live-announce already exists, visually-hidden,
// aria-live="polite", created by core/drupal.announce.
((Drupal, once) => {
  Drupal.behaviors.incidentFilter = {
    attach(context) {
      once('incident-filter', '[data-incident-filter]', context)
        .forEach((select) => {
          select.addEventListener('change', () => {
            const count = filterRows(select.value);
            Drupal.announce(
              Drupal.formatPlural(count, '1 incident found.', '@count incidents found.'),
            );
          });
        });
    },
  };
})(Drupal, once);

// incident_theme.libraries.yml
// incident-filter:
//   js: { js/incident-filter.js: {} }
//   dependencies:
//     - core/drupal
//     - core/drupal.announce
//     - core/once`,
      note: "Drupal.announce() debounces for 200ms and concatenates queued messages, so rapid calls do not cut each other off; pass 'assertive' as the second argument only for errors. Ajax replacements re-run behaviors but never announce on their own.",
      leftLang: "js",
      rightLang: "js",
    },
    {
      label: "Decorative vs meaningful images",
      intro:
        "A severity icon next to a text label carries no information; an incident photo does. Screen readers need those two cases marked differently, and 'no alt attribute' is neither of them.",
      php: `{# Symfony Twig: alt is just an attribute. Nothing checks it,
   nothing distinguishes "decorative" from "someone forgot". #}
<img src="{{ asset('build/images/severity-high.svg') }}" alt="">

<img src="{{ incident.photoUrl }}"
     alt="{{ incident.photoAlt }}"
     width="480" height="320">

{# And the one that ships to production: #}
<img src="{{ asset('build/images/severity-high.svg') }}">`,
      ts: `// Decorative: empty string, plus aria-hidden because the
// adjacent text already says "High".
$build['icon'] = [
  '#theme' => 'image',
  '#uri' => 'themes/custom/incident_theme/images/severity-high.svg',
  '#alt' => '',
  '#attributes' => ['aria-hidden' => 'true'],
];

// Meaningful: alt comes from the image field's alt property,
// which is required by default on image fields.
$build['photo'] = [
  '#theme' => 'image_style',
  '#style_name' => 'incident_thumbnail',
  '#uri' => $file->getFileUri(),
  '#alt' => $item->alt,
  '#width' => $item->width,
  '#height' => $item->height,
];`,
      note: "The image theme hook defaults its alt variable to '', so omitting #alt still renders alt=\"\" — decorative by accident. Passing '#alt' => NULL is the documented way to omit the attribute entirely, and that is when screen readers read the file name aloud. '#alt' => '' plus aria-hidden is the explicit, self-documenting 'this is decorative'.",
      leftLang: "twig",
      rightLang: "php",
    },
  ],

  playground: {
    intro:
      "A miniature form-element preprocess plus form-element.html.twig, in pure PHP. It renders four elements the way Drupal would and flags the ones an axe scan fails. Predict the output — especially which of 'invisible' and 'attribute' is the safe one — before you run it.",
    lang: "php",
    code: `<?php
// A stand-in for Drupal's form-element preprocess + form-element.html.twig.
// It shows what #title / #title_display / #description actually emit, and
// flags the two ways developers delete a screen reader's only clue.

$elements = [
  'title' => [
    '#title' => 'Incident title',
    '#id' => 'edit-title',
    '#required' => TRUE,
    '#description' => 'Shown in the incident list.',
  ],
  'filter' => [
    '#title' => 'Filter incidents',
    '#title_display' => 'invisible',
    '#id' => 'edit-filter',
  ],
  'notes' => [
    '#title' => 'Internal notes',
    '#title_display' => 'attribute',
    '#id' => 'edit-notes',
  ],
  'severity' => [
    '#title' => '',
    '#id' => 'edit-severity',
    '#placeholder' => 'Severity',
  ],
];

function render_form_element(string $key, array $el): array {
  $id = $el['#id'];
  $title = $el['#title'] ?? '';
  $display = $el['#title_display'] ?? 'before';
  $html = [];
  $problems = [];

  if ($title === '') {
    $problems[] = 'no #title, so the input has no accessible name';
  }
  elseif ($display === 'attribute') {
    $problems[] = 'title_display attribute emits title=, never a <label>';
  }

  if ($title !== '' && $display !== 'attribute') {
    $class = $display === 'invisible' ? ' class="visually-hidden"' : '';
    $star = !empty($el['#required']) ? ' <span class="form-required"></span>' : '';
    $html[] = sprintf('<label for="%s"%s>%s%s</label>', $id, $class, $title, $star);
  }

  $described = '';
  if (!empty($el['#description'])) {
    $described = sprintf(' aria-describedby="%s--description"', $id);
  }
  $extra = isset($el['#placeholder']) ? sprintf(' placeholder="%s"', $el['#placeholder']) : '';
  $html[] = sprintf('<input type="text" id="%s" name="%s"%s%s />', $id, $key, $extra, $described);

  if (!empty($el['#description'])) {
    $html[] = sprintf('<div id="%s--description" class="description">%s</div>', $id, $el['#description']);
  }

  return [$html, $problems];
}

$failures = 0;
foreach ($elements as $key => $el) {
  [$html, $problems] = render_form_element($key, $el);
  echo "--- $key ---\\n";
  foreach ($html as $line) {
    echo $line . "\\n";
  }
  foreach ($problems as $problem) {
    $failures++;
    echo "  a11y: $problem\\n";
  }
}

echo "\\n$failures element(s) an axe scan would fail.\\n";
`,
    output: `--- title ---
<label for="edit-title">Incident title <span class="form-required"></span></label>
<input type="text" id="edit-title" name="title" aria-describedby="edit-title--description" />
<div id="edit-title--description" class="description">Shown in the incident list.</div>
--- filter ---
<label for="edit-filter" class="visually-hidden">Filter incidents</label>
<input type="text" id="edit-filter" name="filter" />
--- notes ---
<input type="text" id="edit-notes" name="notes" />
  a11y: title_display attribute emits title=, never a <label>
--- severity ---
<input type="text" id="edit-severity" name="severity" placeholder="Severity" />
  a11y: no #title, so the input has no accessible name

2 element(s) an axe scan would fail.
`,
  },

  keyPoints: [
    "In Drupal the default output is already accessible: skip link, landmark roles, fieldset/legend, aria-describedby on descriptions, role=\"alert\" on error messages. Overriding a template from a blank file is how those disappear — always copy the base template first.",
    "#title is the label. Hide it with '#title_display' => 'invisible' (a real <label class=\"visually-hidden\">); an empty #title or a placeholder-as-label leaves the input with no accessible name. 'attribute' emits title= and no label at all.",
    ".visually-hidden and .visually-hidden.focusable ship in hidden.module.css via the always-present system/base library — use them instead of inventing an .sr-only class in incident_theme.",
    "#description renders with id ELEMENTID--description and is referenced by aria-describedby; keep {{ description.attributes }} in any form-element.html.twig override, that ELEMENTID--description reference is the only aria-describedby core adds for you (in FormBuilder). Inline Form Errors renders each error next to its field and collapses the messages region down to one linked summary — it does not extend aria-describedby.",
    "JS-driven DOM changes are silent: call Drupal.announce() (dependency core/drupal.announce, 200ms debounce, 'polite' by default) after filtering, sorting or Ajax replacement.",
    "'#theme' => 'image' with '#alt' => '' means decorative — and since the image/image_style theme hooks default alt to '', omitting the key gives the same alt=\"\". It is '#alt' => NULL that drops the attribute entirely and leaves screen readers reading the filename. Never remove Claro/Olivero's :focus-visible outlines in a subtheme.",
  ],

  interview: [
    {
      q: "Coming from Symfony, how does your day-to-day accessibility work change on a Drupal project?",
      a: "In Symfony the framework is neutral — Twig emits exactly what I type, so accessibility is entirely additive work I have to remember: labels, landmarks, live regions, focus management, all authored per project. Drupal ships an accessible baseline in core's templates and render elements, so my job flips from *adding* to *not destroying*. Concretely that means copying `core/themes/stable9` or the base theme's template before overriding it, keeping the `#main-content` skip target and `{{ description.attributes }}` intact, and preferring core elements (`table`, `details`, `radios`) over hand-written markup because their templates already carry the right semantics. The genuinely new work is the same in both: `Drupal.announce()` for silent DOM changes, `#alt` decisions, and colour contrast in a custom design. I'd also mention that core patches have to pass an accessibility gate at WCAG 2.1 AA, which is a useful bar to hold custom modules to.",
    },
    {
      q: "A designer's comp shows a filter field with a placeholder and no visible label. How do you build it, and what would you reject?",
      a: "I'd build it with `'#title' => $this->t('Filter incidents')` plus `'#title_display' => 'invisible'`, and put the same text in `#placeholder`. That renders a real `<label for=\"edit-q\">` carrying core's `.visually-hidden` class, so the input keeps an accessible name while matching the comp pixel for pixel. What I'd reject is dropping `#title` and relying on the placeholder — placeholder text is not an accessible name, it disappears on input, and it usually fails contrast. I'd also reject `'#title_display' => 'attribute'` here, since that emits `title=\"...\"` and no `<label>` at all; it's only defensible for icon-sized controls with no room for a label. If the field also has a `#description`, `'#description_display' => 'invisible'` keeps it announced through `aria-describedby` without showing it.",
    },
    {
      q: "Your module filters a table client-side and a QA report says screen-reader users don't know anything happened. Walk through the fix.",
      a: "The DOM changed without navigation, so nothing was announced. The fix is `Drupal.announce()` from inside the behavior that does the filtering — for example `Drupal.announce(Drupal.formatPlural(count, '1 incident found.', '@count incidents found.'))` right after the rows are updated. That writes into core's `#drupal-live-announce` div, which is visually hidden with `aria-live=\"polite\"`, and it debounces for 200ms so rapid changes concatenate instead of cutting each other off. I have to declare `core/drupal.announce` in the library's `dependencies` — the function only exists if that library is on the page. I'd leave the priority at the default `polite`; `'assertive'` interrupts whatever the user is reading and is only appropriate for errors. I'd also check focus: if the filter removes the element that currently has focus, focus has to be moved deliberately rather than falling back to `<body>`.",
    },
    {
      q: "How do you actually test accessibility on a Drupal build, and what will automated tools miss?",
      a: "First a keyboard-only pass: tab from the address bar, confirm the skip link appears on focus (that's what `.visually-hidden.focusable` is for), check every interactive element is reachable and has a visible focus ring, and that dialogs trap and restore focus. Then an automated scan — axe DevTools or Lighthouse — on anonymous and authenticated pages, including a form in its error state, since the messages region only exists after a failed submit. Nightwatch tests in core run axe programmatically and a project can do the same in CI. What the tools cannot see is whether alt text is *meaningful* rather than merely present, whether a `<legend>` names the right group, whether announcements are useful, or whether reading order matches visual order after a CSS grid reflow — those need a real screen reader (NVDA or VoiceOver) and judgement.",
    },
  ],

  quiz: [
    {
      question:
        "The comp has no visible label on the filter field. Which build keeps the input accessible?",
      options: [
        "Omit #title and set '#placeholder' => 'Filter incidents'",
        "'#title' => 'Filter incidents' with '#title_display' => 'invisible'",
        "'#title' => '' plus '#attributes' => ['title' => 'Filter incidents']",
        "'#title' => 'Filter incidents' with '#title_display' => 'attribute'",
      ],
      answerIndex: 1,
      explain:
        "'invisible' still renders <label for=\"...\" class=\"visually-hidden\">, so the input keeps a programmatic name while matching the design. A placeholder is not an accessible name and vanishes on input; an empty #title gives the element nothing; 'attribute' deliberately emits title= and no <label>, which is only acceptable for controls too small to label.",
    },
    {
      question:
        "After overriding page.html.twig in incident_theme, keyboard users report that pressing Tab shows 'Skip to main content' but activating it does nothing. What happened?",
      options: [
        "The theme is missing the core/drupal.announce library dependency",
        "hidden.module.css was not attached, so .visually-hidden.focusable never reveals the link",
        "The override dropped the <a id=\"main-content\" tabindex=\"-1\"></a> target that the skip link in html.html.twig points at",
        "role=\"main\" must be replaced with <main> for skip links to work",
      ],
      answerIndex: 2,
      explain:
        "The skip link lives in html.html.twig and always points at #main-content; page.html.twig owns the anchor it lands on. A page override written from scratch loses that anchor, so the link is visible and focusable but jumps nowhere. hidden.module.css comes from system/base and is on every page regardless of your theme.",
    },
    {
      question:
        "Your JavaScript replaces the incident table's rows after a select change. What must you add so screen-reader users learn the result?",
      options: [
        "Set aria-live=\"assertive\" on the table wrapper in the template",
        "Call Drupal.announce() after updating the rows, with core/drupal.announce in the library dependencies",
        "Re-run Drupal.attachBehaviors(); it announces DOM changes automatically",
        "Add role=\"status\" to each row so each change is spoken",
      ],
      answerIndex: 1,
      explain:
        "Drupal.announce() writes into core's single #drupal-live-announce region (visually hidden, aria-live=\"polite\", 200ms debounce) and is the intended API for this. attachBehaviors() only re-attaches JS behaviors; it never announces. Marking the whole table as a live region — assertive worst of all — makes screen readers read every changed cell.",
    },
    {
      question:
        "An incident severity icon sits directly beside the text 'High'. What is the correct render array?",
      options: [
        "'#theme' => 'image' with '#uri' set and '#alt' => NULL",
        "'#theme' => 'image' with '#alt' => 'High severity icon'",
        "'#theme' => 'image' with '#alt' => '' (and optionally aria-hidden=\"true\")",
        "Raw '#markup' with an <img> and role=\"presentation\"",
      ],
      answerIndex: 2,
      explain:
        "The icon duplicates adjacent text, so it is decorative: an explicit empty alt tells assistive tech to skip it, and aria-hidden=\"true\" plus the self-documenting '#alt' => '' makes that a decision rather than an accident. '#alt' => NULL is the documented way to omit the attribute entirely — with no alt, screen readers announce the file name. (Simply leaving #alt out is not the trap you might expect: the theme hook defaults alt to '', so it renders alt=\"\" anyway.) Raw '#markup' bypasses the image pipeline and its escaping, and 'High severity icon' makes the user hear the same information twice.",
    },
  ],
};

export default lesson;
