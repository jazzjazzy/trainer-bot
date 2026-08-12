import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "element-catalog",
  title: "The Element Catalog: #type Reference That Matters",
  part: "Form API in Depth",
  estMinutes: 12,
  summary:
    "A working inventory of core #types — text, choice, date, file, entity_autocomplete, table, and the structural wrappers — plus the universal # properties that behave the same on every one of them.",

  concept: `
Symfony gives you a class per field: \`TextType\`, \`ChoiceType\`, \`EntityType\`,
\`FileType\`. Drupal gives you a **plugin id in a string**: \`'#type' =>
'textfield'\`. Every \`#type\` is a render-element plugin under
\`Drupal\\Core\\Render\\Element\` (or a module's own — \`datetime\`,
\`managed_file\`, \`entity_autocomplete\` come from the Datetime, File and Core
Entity code). The element plugin's \`getInfo()\` supplies defaults that are
merged into your array before anything renders, which is why a three-line
element already knows how to validate, theme and collect its own value.

### Text and numbers

\`textfield\` (\`#size\`, \`#maxlength\`, \`#pattern\`), \`textarea\`
(\`#rows\`, \`#cols\`, \`#resizable\`), \`email\`, \`tel\`, \`url\`,
\`password\`, \`password_confirm\` (renders two inputs, validates the match for
you, and hands \`submitForm()\` a single string), \`number\` (\`#min\`,
\`#max\`, \`#step\` — HTML5 constraints Drupal *also* enforces server-side) and
\`range\`, the same element with a slider theme. For rich text you want
\`text_format\` from the Filter module, not \`textarea\`: it appends the format
selector, honours \`#allowed_formats\`, and its value is an array —
\`['value' => …, 'format' => 'basic_html']\` — which is the number-one surprise
when someone swaps a textarea for a CKEditor 5 field.

### Choosing things

\`select\`, \`radios\` and \`checkboxes\` all take \`#options\` as
**value => label** (Symfony's \`choices\` is the opposite way round). \`select\`
adds \`#empty_option\`/\`#empty_value\`, \`#multiple\`, and \`#size\`. Rule of
thumb: radios up to about five mutually exclusive choices, select beyond that,
checkboxes for multi-select. \`checkboxes\` returns a keyed array where checked
items are \`key => key\` and unchecked are \`key => 0\`, so
\`array_filter()\` before you store anything.

### Dates, files, entities

\`date\` is a plain HTML5 input whose value is a \`Y-m-d\` string. \`datetime\`
(Datetime module) is the real one: \`#date_date_element\`,
\`#date_time_element\`, \`#date_increment\`, and a \`DrupalDateTime\` object in
and out. \`managed_file\` uploads through Drupal's file system and returns an
array of file IDs — the file row is created **temporary**, so you must
\`setPermanent()\`, save, and register usage or cron deletes it.
\`entity_autocomplete\` is \`EntityType\` without the query builder:
\`#target_type\`, \`#selection_handler\`, \`#selection_settings\`, plus
\`#tags\` for the comma-separated multi-value style and \`#autocreate\`, which
*builds* a missing term — validation hands it back **unsaved** as
\`['entity' => $term]\`, and only an entity_reference field widget saves it for
you.

### Structure and buttons

\`container\` (a div, plus \`#tree\`), \`fieldset\` (fieldset + legend),
\`details\` (\`#open\`), \`vertical_tabs\` (children are \`details\` elements
carrying \`#group\`), \`table\` and \`tableselect\` for grids, and \`actions\`
— a container with \`#weight\` 100 so buttons sink to the bottom. On buttons,
\`#submit\` replaces the form-level handlers and \`#limit_validation_errors\`
narrows validation to named sections.

### The properties that work everywhere

\`#title\`, \`#description\` (+\`#description_display\`), \`#required\`,
\`#default_value\`, \`#disabled\`, \`#access\`, \`#weight\`, \`#prefix\`/
\`#suffix\`, \`#attributes\`, \`#states\`. Two security notes: \`#disabled\`
and \`#access => FALSE\` both make FormBuilder **ignore submitted input** and
fall back to \`#default_value\`, and \`#prefix\`/\`#suffix\` are run through
\`Xss::filterAdmin()\` unless you pass \`Markup\` objects.
`,

  comparisons: [
    {
      label: "Choice fields: ChoiceType vs select / radios / checkboxes",
      intro:
        "Symfony picks the widget with expanded/multiple flags on one type class. Drupal picks it by choosing a different #type — and the #options array is keyed the other way round.",
      php: `<?php
// src/Form/IncidentType.php
$builder
    ->add('severity', ChoiceType::class, [
        'label' => 'Severity',
        // choices are LABEL => value
        'choices' => ['Low' => 'low', 'High' => 'high', 'Critical' => 'critical'],
        'placeholder' => '- Select -',
        'expanded' => false,   // <select>
        'multiple' => false,
        'required' => true,
        'data' => 'low',
    ])
    ->add('systems', ChoiceType::class, [
        'label' => 'Affected systems',
        'choices' => ['API' => 'api', 'Database' => 'db'],
        'expanded' => true,    // checkboxes
        'multiple' => true,
    ]);

// $form->getData()['systems'] === ['api', 'db'] — clean array`,
      ts: `<?php
// src/Form/IncidentReportForm.php — buildForm()
$form['severity'] = [
  '#type' => 'select',
  '#title' => $this->t('Severity'),
  // #options are VALUE => label
  '#options' => [
    'low' => $this->t('Low'),
    'high' => $this->t('High'),
    'critical' => $this->t('Critical'),
  ],
  '#empty_option' => $this->t('- Select -'),
  '#empty_value' => '',
  '#default_value' => 'low',
  '#required' => TRUE,
];

$form['systems'] = [
  '#type' => 'checkboxes',
  '#title' => $this->t('Affected systems'),
  '#options' => ['api' => $this->t('API'), 'db' => $this->t('Database')],
];

// submitForm(): raw value is ['api' => 'api', 'db' => 0]
$systems = array_values(array_filter(
  $form_state->getValue('systems')
));`,
      note:
        "Three traps: #options is value => label (Symfony reverses it); #empty_option is only the visible placeholder, #empty_value is what actually posts; and checkboxes hand you key => key / key => 0, never a clean list. Swap #type to 'radios' and nothing else changes — same #options, different widget.",
      leftLang: "php",
      rightLang: "php",
    },
    {
      label: "Referencing an entity: EntityType vs entity_autocomplete",
      intro:
        "Both need to know the target class/type and how to narrow the candidates. Symfony hands the query builder to you; Drupal delegates to a selection plugin so that the same access rules apply as everywhere else.",
      php: `<?php
use App\\Entity\\Team;
use Symfony\\Bridge\\Doctrine\\Form\\Type\\EntityType;

$builder->add('owner', EntityType::class, [
    'class' => Team::class,
    'choice_label' => 'name',
    'query_builder' => fn (TeamRepository $r) => $r
        ->createQueryBuilder('t')
        ->where('t.active = true')
        ->orderBy('t.name', 'ASC'),
    'placeholder' => '- Any team -',
    'multiple' => false,
]);

// Bound data is a Team object; with multiple => true it is a Collection.`,
      ts: `<?php
$form['owner'] = [
  '#type' => 'entity_autocomplete',
  '#title' => $this->t('Owning team'),
  '#target_type' => 'taxonomy_term',
  '#selection_handler' => 'default:taxonomy_term',
  '#selection_settings' => [
    'target_bundles' => ['incident_teams'],
  ],
  // #default_value takes ENTITY OBJECTS, not ids.
  '#default_value' => $team ?? NULL,
  // #autocreate BUILDS an unsaved term; nothing is written to the DB here.
  '#autocreate' => [
    'bundle' => 'incident_teams',
    'uid' => $this->currentUser()->id(),
  ],
];

$form['tags'] = [
  '#type' => 'entity_autocomplete',
  '#title' => $this->t('Tags'),
  '#target_type' => 'taxonomy_term',
  '#tags' => TRUE,
  '#selection_settings' => ['target_bundles' => ['incident_tags']],
];

// submitForm():
$owner = $form_state->getValue('owner');   // 42 for an EXISTING term…
if (is_array($owner)) {
  // …but ['entity' => $unsaved_term] when #autocreate minted a new one.
  // On a custom form NOTHING saves it for you — entity_reference field
  // widgets get that for free via EntityReferenceItem::preSave().
  $owner['entity']->save();
  $owner = $owner['entity']->id();
}
$tags = $form_state->getValue('tags');     // [['target_id' => 7], …]`,
      note:
        "entity_autocomplete gives you an id, not an object — load it yourself. #tags => TRUE switches to the comma-separated multi-value widget and changes the value shape to a list of ['target_id' => …]. #autocreate is the exception to 'the value is an id': EntityAutocomplete::validateEntityAutocomplete() only calls createNewEntity(), which instantiates an UNSAVED entity and hands it back as ['entity' => $entity], so even a non-#tags element stops returning a plain id. Persistence happens in EntityReferenceItem::preSave(), i.e. only when the value flows through an entity_reference field — on a plain FormBase form you must detect the 'entity' key and save it yourself. #selection_handler defaults to 'default:<target_type>'; swap in 'views' with a #selection_settings['view'] to reuse a View as the candidate list, which is the real replacement for a query_builder.",
      leftLang: "php",
      rightLang: "php",
    },
    {
      label: "File uploads: FileType + File constraint vs managed_file",
      intro:
        "Symfony hands you an UploadedFile and lets you move it. Drupal's managed_file writes a File entity for you — but leaves it temporary until you claim it.",
      php: `<?php
use Symfony\\Component\\Form\\Extension\\Core\\Type\\FileType;
use Symfony\\Component\\Validator\\Constraints\\File;

$builder->add('evidence', FileType::class, [
    'label' => 'Evidence (PDF/PNG)',
    'mapped' => false,
    'required' => false,
    'constraints' => [
        new File(
            maxSize: '5M',
            extensions: ['pdf', 'png'],
            extensionsMessage: 'Please upload a PDF or PNG.',
        ),
    ],
]);

// In the controller, after isValid():
$upload = $form->get('evidence')->getData();  // UploadedFile|null
$upload?->move($this->uploadDir, uniqid().'.'.$upload->guessExtension());`,
      ts: `<?php
$form['evidence'] = [
  '#type' => 'managed_file',
  '#title' => $this->t('Evidence (PDF/PNG)'),
  '#upload_location' => 'private://incidents/evidence',
  '#multiple' => FALSE,
  '#upload_validators' => [
    'FileExtension' => ['extensions' => 'pdf png'],
    'FileSizeLimit' => ['fileLimit' => 5 * 1024 * 1024],
  ],
];

// submitForm(): the value is an ARRAY of file ids, even for a single upload.
$fids = $form_state->getValue('evidence') ?: [];
foreach ($fids as $fid) {
  // $this->entityTypeManager is INJECTED via create()/__construct() —
  // FormBase has no entityTypeManager() method (that is ControllerBase).
  $file = $this->entityTypeManager->getStorage('file')->load($fid);
  $file->setPermanent();
  $file->save();
  // Otherwise cron deletes it after 6 hours (system.file temporary_maximum_age).
  $this->fileUsage->add($file, 'incident_tracker', 'incident', $incident_id);
}`,
      note:
        "The #upload_validators keys shown are the constraint-plugin style introduced in Drupal 10.2 ('FileExtension' => ['extensions' => 'pdf png'], 'FileSizeLimit' => ['fileLimit' => …]). The old 'file_validate_extensions' => ['pdf png'] form is deprecated in 10.2/10.3 and disallowed in Drupal 11 — write the new keys on any 10.2+ site. Note also that managed_file uploads via AJAX before the form is submitted, so the File entity already exists (status 0) while the user is still typing. One FormBase gotcha in that loop: unlike ControllerBase, FormBase gives you config(), currentUser(), logger(), redirect(), getRequest() and getRouteMatch() but NOT entityTypeManager() — inject entity_type.manager (and file.usage) through create() and read them as properties.",
      leftLang: "php",
      rightLang: "php",
    },
    {
      label: "Grouping and buttons: form_row groups vs details / actions",
      intro:
        "Same goal — collapse a long form into sections and give it a couple of buttons where one of them must not run validation.",
      php: `<?php
// Grouping in Symfony is mostly a TEMPLATE concern…
// templates/incident/report.html.twig:
//   <details open>
//     <summary>Details</summary>
//     {{ form_row(form.title) }}
//   </details>

// …and "don't validate me" is a validation group:
$builder
    ->add('save', SubmitType::class, ['label' => 'Save'])
    ->add('back', SubmitType::class, [
        'label' => 'Back',
        'validation_groups' => false,
    ]);

// In the controller:
if ($form->get('back')->isClicked()) {
    return $this->redirectToRoute('incident_list');
}`,
      ts: `<?php
$form['tabs'] = ['#type' => 'vertical_tabs', '#default_tab' => 'edit-what'];

$form['what'] = [
  '#type' => 'details',
  '#title' => $this->t('What happened'),
  '#group' => 'tabs',
  '#open' => TRUE,
];
$form['what']['title'] = ['#type' => 'textfield', '#title' => $this->t('Title')];

$form['actions'] = ['#type' => 'actions'];   // #weight 100 — sinks to the bottom
$form['actions']['submit'] = [
  '#type' => 'submit',
  '#value' => $this->t('Save'),
  '#button_type' => 'primary',
];
$form['actions']['back'] = [
  '#type' => 'submit',
  '#value' => $this->t('Back'),
  // Skip ALL validation, including #required, for this button.
  '#limit_validation_errors' => [],
  '#submit' => ['::backSubmit'],
];`,
      note:
        "#group is the wiring for vertical_tabs — the child details keeps its own place in $form but renders inside the tab set. #limit_validation_errors => [] validates nothing; #limit_validation_errors => [['what']] validates only that subtree — and in both cases $form_state->getValues() is pruned to the listed sections, which is the classic 'my values vanished' bug. #submit on a button replaces the form-level submitForm() entirely.",
      leftLang: "php",
      rightLang: "php",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A miniature FormBuilder: merge element_info defaults, sort children by #weight, then extract a value per #type — including the tamper rules for #disabled and #access. Predict the printed values (especially 'reporter' and 'systems') before you reveal.",
    code: `<?php
// A miniature Form API: element_info defaults, #weight ordering, and the
// per-#type value extraction rules FormBuilder applies before you ever
// see $form_state->getValues().

$element_info = [
  'textfield'  => ['#size' => 60, '#maxlength' => 128],
  'select'     => ['#empty_value' => ''],
  'checkboxes' => ['#default_value' => []],
  'actions'    => ['#weight' => 100],
];

// Which #types actually collect input (#input => TRUE in element_info).
$input_types = ['textfield', 'select', 'checkboxes'];

$form = [
  'title' => [
    '#type' => 'textfield',
    '#title' => 'What happened?',
  ],
  'severity' => [
    '#type' => 'select',
    '#title' => 'Severity',
    '#options' => ['low' => 'Low', 'high' => 'High', 'critical' => 'Critical'],
    '#empty_option' => '- Select -',
    '#weight' => -5,
  ],
  'systems' => [
    '#type' => 'checkboxes',
    '#title' => 'Affected systems',
    '#options' => ['api' => 'API', 'db' => 'Database', 'cdn' => 'CDN'],
    '#weight' => 5,
  ],
  'reporter' => [
    '#type' => 'textfield',
    '#title' => 'Reporter',
    '#disabled' => TRUE,
    '#default_value' => 'alice',
    '#weight' => 2,
  ],
  'internal_ref' => [
    '#type' => 'textfield',
    '#title' => 'Internal ref',
    '#access' => FALSE,
    '#default_value' => 'INC-000',
    '#weight' => 3,
  ],
  'actions' => ['#type' => 'actions'],
];

// What the browser POSTed — including two tampered fields.
$input = [
  'title' => '  Payment API 500s  ',
  'severity' => 'high',
  'systems' => ['api' => 'api', 'db' => 0, 'cdn' => 'cdn'],
  'reporter' => 'mallory',
  'internal_ref' => 'INC-666',
];

// 1. Merge element_info defaults (keys you set always win) + a default #weight.
foreach ($form as $name => $element) {
  $form[$name] += $element_info[$element['#type']] ?? [];
  $form[$name] += ['#weight' => 0, '#access' => TRUE];
}

// 2. Sort by #weight. PHP 8 sorts are stable, like Element::children($form, TRUE).
uasort($form, fn($a, $b) => $a['#weight'] <=> $b['#weight']);

echo "Render order: " . implode(', ', array_keys($form)) . "\\n\\n";

// 3. Extract a value per element.
$values = [];
foreach ($form as $name => $element) {
  if (!in_array($element['#type'], $input_types, TRUE)) {
    continue;
  }
  // #access FALSE and #disabled ignore user input — tamper-proof by design.
  if ($element['#access'] === FALSE || !empty($element['#disabled'])) {
    $values[$name] = $element['#default_value'] ?? NULL;
    continue;
  }
  $raw = $input[$name] ?? NULL;
  $values[$name] = match ($element['#type']) {
    // Checkboxes post key => key when checked, key => 0 when not.
    'checkboxes' => array_values(array_filter((array) $raw)),
    'textfield' => trim((string) $raw),
    default => $raw,
  };
}

print_r($values);

echo "\\nsubmitted reporter: " . $input['reporter'] . " -> stored: " . $values['reporter'] . "\\n";
echo "'#empty_option' is display only; the select posts '" . $values['severity'] . "'\\n";`,
    output: `Render order: severity, title, reporter, internal_ref, systems, actions

Array
(
    [severity] => high
    [title] => Payment API 500s
    [reporter] => alice
    [internal_ref] => INC-000
    [systems] => Array
        (
            [0] => api
            [1] => cdn
        )

)

submitted reporter: mallory -> stored: alice
'#empty_option' is display only; the select posts 'high'
`,
  },

  keyPoints: [
    "Every #type is a render-element plugin whose getInfo() defaults are merged into your array — that is why 'textfield' already knows its theme, its #size and how to collect a value.",
    "#options is value => label (the reverse of Symfony's choices), and checkboxes/tableselect return key => key for selected and key => 0 for not — always array_filter().",
    "Value shapes bite: text_format returns ['value' => …, 'format' => …], managed_file returns an array of fids even when #multiple is FALSE, entity_autocomplete returns an id (or [['target_id' => …]] with #tags), datetime returns a DrupalDateTime.",
    "managed_file creates a temporary File entity during upload — call setPermanent(), save(), and file.usage->add() in submitForm() or cron will delete it.",
    "On Drupal 10.2+ and 11, #upload_validators uses constraint ids: 'FileExtension' => ['extensions' => 'pdf png'] and 'FileSizeLimit' => ['fileLimit' => bytes]; the old file_validate_* keys are gone in 11.",
    "#disabled and #access => FALSE both discard submitted input and fall back to #default_value, so they are safe against a tampered POST; #limit_validation_errors also prunes $form_state->getValues() to the listed sections.",
  ],

  interview: [
    {
      q: "How do you decide between select, radios and checkboxes, and what does each hand you in submitForm()?",
      a: "They share the same `#options` array (value => label), so the choice is purely UX plus value shape. `radios` for a handful of mutually exclusive options where seeing them all matters — severity, yes/no — and `select` once the list gets long or comes from a dynamic source, where `#empty_option` gives you the visible placeholder and `#empty_value` controls what actually posts for it. `checkboxes` is the multi-value case and is the one that trips people: the value is a keyed array with checked items as `key => key` and unchecked as `key => 0`, so you almost always write `array_filter()` (or `array_keys(array_filter(...))`) before storing. In Symfony this is one `ChoiceType` with `expanded`/`multiple` flags and you get a clean array back; Drupal makes you pick the element and clean the value yourself.",
    },
    {
      q: "A custom form needs to let an editor pick an existing content item. What element do you use and what do you have to be careful about?",
      a: "`entity_autocomplete`, configured with `#target_type` and a `#selection_settings` array — typically `target_bundles` — which delegates candidate lookup to an EntityReferenceSelection plugin, so entity access and published status are respected without you writing a query. Three gotchas worth naming in an interview: `#default_value` expects loaded entity objects, not ids; the submitted value is an id (or a list of `['target_id' => …]` when `#tags` is TRUE); and `#autocreate` changes that value shape rather than doing what its name suggests — it builds an *unsaved* entity and returns `['entity' => $term]`, so even a single-value element stops giving you an id, and nothing is written to the database. The save only happens in `EntityReferenceItem::preSave()`, so on a custom form you have to check for the `entity` key and call `save()` yourself. If you need a custom candidate list, don't hand-roll an autocomplete route — set `#selection_handler` to `'views'` and point `#selection_settings['view']` at a View display, which is the Drupal equivalent of Symfony's `query_builder` option on `EntityType`.",
    },
    {
      q: "What is #limit_validation_errors on a button, and when have you needed it?",
      a: "It restricts validation to named element subtrees, expressed as an array of `#parents` paths — `[['contact']]` validates only that section, and `[]` validates nothing at all. You need it for any button that isn't the real save: a Back or Cancel button that must work even when `#required` fields are empty, an 'Add another item' AJAX button on a multi-value widget, or a preview step that only cares about one fieldset. The catch that bites everyone once is that it also prunes `$form_state->getValues()` down to the listed sections, so a `#submit` handler on that button can only see the values inside them — read the rest with `getUserInput()` or widen the list. The nearest Symfony analogue is setting `validation_groups => false` on a submit button, but Symfony never removes data from the form as a side effect.",
    },
    {
      q: "You added a managed_file element, the upload works, but the file disappears the next day. What happened?",
      a: "`managed_file` uploads via AJAX and creates a File entity immediately with status 0 (temporary). Drupal's file cron deletes temporary files older than the `system.file` `temporary_maximum_age` setting (six hours by default), so a file nobody claimed is garbage-collected. The fix is in `submitForm()`: the element's value is an array of fids, so load each File, call `setPermanent()` and `save()`, and register a usage record via the `file.usage` service so the file is tied to your incident record. Registering usage also means deleting the incident can release the file properly instead of leaving an orphan.",
    },
  ],

  quiz: [
    {
      question:
        "A checkboxes element with #options ['api' => 'API', 'db' => 'DB', 'cdn' => 'CDN'] is submitted with API and CDN ticked. What does $form_state->getValue('systems') return?",
      options: [
        "['api', 'cdn']",
        "['api' => 'api', 'db' => 0, 'cdn' => 'cdn']",
        "['api' => TRUE, 'db' => FALSE, 'cdn' => TRUE]",
        "'api,cdn'",
      ],
      answerIndex: 1,
      explain:
        "checkboxes keeps every option key: selected ones map to their own key, unselected ones to integer 0. That is why the idiom is array_filter() (or array_keys(array_filter(...))) before you store or compare anything — a raw in_array() check against 0 will bite you.",
    },
    {
      question:
        "An element has '#access' => FALSE and '#default_value' => 'INC-000'. A user crafts a POST containing internal_ref=INC-666. What ends up in $form_state->getValues()?",
      options: [
        "'INC-666' — #access only hides the element visually",
        "'INC-000' — inaccessible elements ignore user input and use the default",
        "NULL — the key is removed entirely and reading it throws",
        "'INC-666', but validateForm() automatically flags a tamper error",
      ],
      answerIndex: 1,
      explain:
        "FormBuilder treats #access => FALSE (and #disabled) as 'this value is not user-supplied': the submitted input is discarded and #default_value is used instead. That makes both properties genuinely tamper-safe, unlike simply hiding an element with CSS or #states.",
    },
    {
      question:
        "Which #upload_validators array is correct for a managed_file element on Drupal 11?",
      options: [
        "['file_validate_extensions' => ['pdf png'], 'file_validate_size' => [5242880]]",
        "['FileExtension' => ['extensions' => 'pdf png'], 'FileSizeLimit' => ['fileLimit' => 5242880]]",
        "['extensions' => 'pdf png', 'max_filesize' => '5 MB']",
        "['constraints' => [new File(maxSize: '5M', extensions: ['pdf', 'png'])]]",
      ],
      answerIndex: 1,
      explain:
        "Drupal 10.2 converted file validators to constraint plugins keyed by plugin id, with named options: 'FileExtension' => ['extensions' => …], 'FileSizeLimit' => ['fileLimit' => …], plus FileIsImage, FileImageDimensions and FileNameLength. The old file_validate_* keys were deprecated in 10.2 and are disallowed in Drupal 11.",
    },
    {
      question:
        "What is the effect of '#type' => 'text_format' instead of 'textarea' on the submitted value?",
      options: [
        "No difference — it is still a plain string",
        "The value becomes an array with 'value' and 'format' keys",
        "The value is pre-rendered HTML, already filtered",
        "The value is a FilteredMarkup object you must cast to string",
      ],
      answerIndex: 1,
      explain:
        "text_format wraps a textarea with a format selector, so $form_state->getValue('body') returns ['value' => '…', 'format' => 'basic_html']. You store both parts and render them later with ['#type' => 'processed_text', '#text' => …, '#format' => …] — never by echoing the raw value.",
    },
  ],
};

export default lesson;
