import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "forms-are-arrays",
  title: "The Form API Mental Model: Forms Are Arrays",
  part: "Form API in Depth",
  estMinutes: 13,
  summary:
    "Go beneath buildForm(): how FormBuilder turns your nested element array into a processed form, why every POST re-enters buildForm(), where the build is cached, and how #tree decides the shape of getValues().",

  concept: `
You already write \`buildForm()\`. This section is about the machine that calls
it, because almost every confusing Form API bug lives in that machine rather
than in your class.

## Symfony's object graph vs Drupal's array

In Symfony, \`createForm()\` goes through \`FormFactory\` to a
\`FormBuilder\`, and \`getForm()\` materialises a **graph of \`Form\` objects** —
each with a resolved \`FormType\`, a data mapper, view data, and children.
\`handleRequest()\` binds the request onto that graph; \`isValid()\` walks it. The
graph is created fresh per request and thrown away at the end.

In Drupal there is no graph. \`$form\` is a **render array** of \`#type\` elements,
and all the behaviour lives in one service, \`form_builder\`
(\`Drupal\\Core\\Form\\FormBuilder\`), plus the mutable \`FormStateInterface\` that
travels beside the array.

## The lifecycle FormBuilder actually runs

\`FormBuilder::getForm()\` creates a \`FormState\`, then calls \`buildForm()\`, which:

1. resolves the **form_id** from \`getFormId()\`, and mints a **form_build_id** —
   a random \`form-…\` token identifying *this particular build*;
2. calls \`retrieveForm()\`, which invokes **your** \`buildForm()\` — unless the POST
   carries a \`form_build_id\` whose build is in the form cache, in which case the
   stored array is used instead;
3. calls \`prepareForm()\`, which adds the hidden \`form_id\`, \`form_build_id\` and
   (for authenticated users) \`form_token\` elements, sets \`#theme\` suggestions,
   and fires \`hook_form_alter()\` / \`hook_form_FORM_ID_alter()\`;
4. calls \`processForm()\` → \`doBuildForm()\`, the recursive walk that makes an
   array into a form.

\`doBuildForm()\` is the interesting one. Per element it merges the \`#type\`
defaults from the element plugin's \`getInfo()\`, computes \`#parents\`,
\`#array_parents\`, \`#name\` and \`#id\`, pulls the submitted value through the
element's value callback, runs **\`#process\`** callbacks, recurses into children,
then runs **\`#after_build\`**. \`#process\` fires when the element is expanded and
may *grow structure* (\`checkboxes\` becomes N \`checkbox\` children that way);
\`#after_build\` fires once the element and all its children are finished — the
last chance to touch the completed tree. They are the rough analogue of
Symfony's \`FormEvents::PRE_SET_DATA\` / \`PRE_SUBMIT\` listeners.

## Every submit re-enters buildForm()

Nothing survives between requests, so before Drupal can validate a POST it must
have the structure again: \`buildForm()\` runs *again* on submission. If a submit
handler calls \`$form_state->setRebuild()\`, the redirect is cancelled and it runs
a third time with values preserved — that is the whole multistep/AJAX engine.
So \`buildForm()\` must be deterministic and free of side effects, and per-build
data belongs in \`$form_state->set()\`, never in class properties.

## Two different caches

Forms that cannot be rebuilt from scratch are stored server-side:
\`$form_state->setCached()\` (POST only — calling it on GET throws), and
\`FormCache\` writes the built \`$form\` and the \`$form_state\` into the
key-value-expirable \`form\` / \`form_state\` collections keyed by \`form_build_id\`,
for six hours by default — \`\\Drupal\\Core\\Form\\FormCache::setCache()\` uses
\`$expire = Settings::get('form_cache_expiration', 21600)\`, so a site can retune it
with \`$settings['form_cache_expiration']\` in \`settings.php\`. That is the
**form cache**, and it is unrelated to \`#cache\` keys/contexts/tags, which is the
**render cache** on the render-array side.

## #tree

Finally, the classic: a child's \`#parents\` — its slot in
\`$form_state->getValues()\` — is the parent's \`#parents\` plus its key **only if
the parent has \`#tree\` TRUE**. Otherwise it is flattened to \`[key]\`. Symfony
always nests (\`incident[severity]\`); Drupal flattens by default.
`,

  comparisons: [
    {
      label: "The lifecycle you drive vs the lifecycle that drives you",
      intro:
        "The same incident form, viewed from the framework's side. Symfony hands your controller a Form object graph to interrogate; Drupal hands FormBuilder your array and calls back into your class at fixed points.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony: the object graph is built, bound, and discarded per request.
public function report(Request $request): Response
{
    // FormFactory -> FormBuilder -> Form object graph.
    $form = $this->createFormBuilder(new Incident())
        ->add('title', TextType::class)
        ->add('severity', ChoiceType::class, [
            'choices' => ['Low' => 'low', 'Critical' => 'critical'],
        ])
        ->getForm();

    // Binds request data onto the graph and runs the transformers.
    $form->handleRequest($request);

    if ($form->isSubmitted() && $form->isValid()) {
        $incident = $form->getData();       // hydrated object
        // ... persist, redirect
    }

    // Multistep? You keep the wizard state yourself (session,
    // a hidden step field, or the Workflow component). The Form
    // object itself is never persisted between requests.
    return $this->render('incident/report.html.twig', [
        'form' => $form->createView(),      // FormView, then Twig
    ]);
}`,
      ts: `<?php
// Drupal: FormBuilder owns the loop; your class supplies callbacks.
//
//   FormBuilder::getForm(IncidentReportForm::class)
//     -> new FormState()
//     -> buildForm(form_id, $form_state)
//          -> retrieveForm()  : YOUR buildForm() (or the cached array)
//          -> prepareForm()   : hidden form_id / form_build_id /
//                               form_token, #theme, hook_form_alter()
//          -> processForm()   : doBuildForm() walks every element,
//                               then validate -> submit -> redirect
//                               (or rebuild, if setRebuild() was called)

final class IncidentReportForm extends FormBase {

  public function buildForm(array $form, FormStateInterface $form_state): array {
    // Runs on the GET *and* again on every POST. Keep it pure:
    // no writes, no random defaults, no counters on $this.
    $step = $form_state->get('step') ?? 1;   // per-build state lives here

    $form['title'] = ['#type' => 'textfield', '#title' => $this->t('Title')];
    if ($step === 2) {
      $form['root_cause'] = ['#type' => 'textarea', '#title' => $this->t('Root cause')];
    }
    $form['actions']['submit'] = ['#type' => 'submit', '#value' => $this->t('Next')];
    return $form;
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $form_state->set('step', 2);
    // Cancel the redirect: FormBuilder re-enters buildForm() with the
    // submitted values still in $form_state.
    $form_state->setRebuild();
  }
}`,
      note: "Symfony: one object graph per request, you drive it. Drupal: an array plus a FormState, and FormBuilder drives you — which is why buildForm() must be safe to call two or three times per submission.",
    },
    {
      label: "#tree: always-nested names vs opt-in nesting",
      intro:
        "A grouped 'reporter' sub-form on both sides. Symfony compound forms always produce nested names and nested data; Drupal flattens children into top-level values unless the parent sets #tree.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony: nesting is structural — a compound child is always a namespace.
$builder
    ->add('title', TextType::class)
    ->add('reporter', ReporterType::class);   // has name + email

// Rendered input names (never a choice you make):
//   incident[title]
//   incident[reporter][name]
//   incident[reporter][email]

$data = $form->getData();
$data->reporter->name;                       // nested object/array
$form->get('reporter')->get('name')->getData();

// There is no "flatten this sub-form" switch. If you want a flat
// namespace you use a non-compound type or map it yourself.`,
      ts: `<?php
// Drupal: array nesting is NOT value nesting. #tree decides.
$form['title'] = ['#type' => 'textfield'];

$form['diagnostics'] = ['#type' => 'details', '#title' => $this->t('Diagnostics')];
$form['diagnostics']['steps'] = ['#type' => 'textarea'];
// #tree defaults to FALSE, so:
//   name="steps"  #parents = ['steps']
$form_state->getValue('steps');                  // 'Restart the primary'
$form_state->getValue(['diagnostics', 'steps']); // NULL — no such slot

$form['reporter'] = [
  '#type' => 'fieldset',
  '#tree' => TRUE,        // inherited by every descendant
];
$form['reporter']['name'] = ['#type' => 'textfield'];
// name="reporter[name]"  #parents = ['reporter', 'name']
$form_state->getValue(['reporter', 'name']);     // 'Ada'
$form_state->getValue('name');                   // NULL

// #array_parents ignores #tree — it always mirrors the literal array,
// which is why #ajax callbacks navigate with #array_parents:
// NestedArray::getValue($form, array_slice($el['#array_parents'], 0, -1));`,
      note: "Two element names can collide across different containers when #tree is FALSE — the last one built wins the value slot. Turn #tree on for any repeated or reusable group, and remember setErrorByName() takes the #parents path as a bracket string ('reporter][name'), not the array path — passing an array is a TypeError. The array-friendly alternative is $form_state->setError($element, $message), which derives that string from the element's own #parents.",
    },
    {
      label: "Growing the form at build time: form events vs #process / #after_build",
      intro:
        "Same requirement: add elements to the form after the initial definition, based on data. Symfony listens to form events on the Form object; Drupal attaches callbacks to the element array.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony: event listeners on the builder mutate the object graph.
use Symfony\\Component\\Form\\FormEvent;
use Symfony\\Component\\Form\\FormEvents;

$builder->addEventListener(
    FormEvents::PRE_SET_DATA,
    function (FormEvent $event): void {
        $incident = $event->getData();
        $form = $event->getForm();

        // Add a child form conditionally, before the view is built.
        if ($incident?->severity === 'critical') {
            $form->add('pager_duty_ref', TextType::class, [
                'label' => 'PagerDuty incident',
            ]);
        }
    },
);

// PRE_SUBMIT sees raw request data before transformers;
// POST_SUBMIT runs after the graph is populated and validated.`,
      ts: `<?php
// Drupal: callbacks on the element, run by doBuildForm().
$form['systems'] = [
  '#type' => 'checkboxes',
  '#options' => ['api' => $this->t('API'), 'db' => $this->t('Database')],
  // core's Checkboxes::processCheckboxes() is already in #process —
  // it expands this ONE element into a child per option.
  '#process' => [
    [Checkboxes::class, 'processCheckboxes'],
    [static::class, 'processSystems'],
  ],
];

// #process: element is being expanded. You may add children here.
// Signature: (&$element, FormStateInterface $form_state, &$complete_form)
public static function processSystems(array &$element, FormStateInterface $form_state, array &$complete_form): array {
  foreach (Element::children($element) as $key) {
    $element[$key]['#description'] = t('Owner: @team', ['@team' => $key]);
  }
  return $element;
}

// #after_build: this element AND all its children are finished.
// Signature: ($element, FormStateInterface &$form_state)
$form['#after_build'][] = [static::class, 'afterBuildStripDescriptions'];

public static function afterBuildStripDescriptions(array $element, FormStateInterface $form_state): array {
  // Last stop before validation/rendering — the whole tree is here.
  unset($element['title']['#description']);
  return $element;
}`,
      note: "#process runs before children exist (so it can create them); #after_build runs after they do (so it can inspect the finished tree). The form cache stores the form as it was BEFORE doBuildForm() ran (core keeps an $unprocessed_form copy for exactly this), so a restored build is re-walked from scratch — #process and #after_build both run again, which is how new user input gets mapped onto the restored structure. What a cache hit really skips is retrieveForm() and prepareForm(): your buildForm() and hook_form_alter() do NOT run again for that build.",
    },
    {
      label: "What survives between requests",
      intro:
        "Symfony rebuilds the form from the FormType on every request and keeps nothing server-side. Drupal can persist an entire built form array, keyed by the hidden form_build_id.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony: the POST carries data + a CSRF token; the server stores
// only the token (in the session). The Form object is reconstructed
// from IncidentType on every single request.

// framework.yaml
// framework:
//     form: true
//     csrf_protection: true

// Rendered by form_rest(form):
//   <input type="hidden" name="incident[_token]" value="8Kx...">

// Multistep wizards therefore need YOUR storage:
$session->set('incident_wizard', $form->getData());`,
      ts: `<?php
// Drupal: the POST carries form_id + form_build_id (+ form_token for
// authenticated users). form_build_id is the key into the form cache.

//   <input type="hidden" name="form_id" value="incident_tracker_report">
//   <input type="hidden" name="form_build_id" value="form-Yb3p…">
//   <input type="hidden" name="form_token" value="Xk1…">

// Opting a build into the form cache (POST only; on GET it throws):
$form_state->setCached();
// #ajax on any element does this for you.

// FormCache then stores, keyed by form_build_id:
//   key_value_expire collection 'form'       -> the built $form array
//   key_value_expire collection 'form_state' -> the FormState
// Lifetime: FormCache::setCache() does
//   $expire = Settings::get('form_cache_expiration', 21600);
// so six hours is only the DEFAULT — override it with
// $settings['form_cache_expiration'] in settings.php.

// Do NOT confuse that with the RENDER cache on the same array:
$form['#cache'] = [
  'contexts' => ['user.permissions'],
  'tags' => ['node_list:incident'],
];`,
      note: "form_id says which form's handlers to run; form_build_id says which build to restore. A rebuild mints a new build_id and keeps the old one in #build_id_old so the AJAX response can update the hidden field in the browser.",
    },
  ],

  playground: {
    intro:
      "doBuildForm() reduced to its #parents rule. Two containers hold one field each; only one of them sets #tree. Predict the name attributes and which getValue() calls come back NULL before you run it.",
    lang: "php",
    code: `<?php
// FormBuilder::doBuildForm() in miniature. On EVERY request it walks the
// element tree and decides, per element: its #parents (the slot its value
// occupies in $form_state), its HTML name attribute, and — via #tree —
// whether that slot is nested or flattened to the top level.

$form = [
  '#type' => 'form',
  '#tree' => FALSE,
  'title' => ['#type' => 'textfield'],
  'diagnostics' => [
    '#type' => 'details',
    'steps' => ['#type' => 'textarea'],
  ],
  'reporter' => [
    '#type' => 'fieldset',
    '#tree' => TRUE,
    'name' => ['#type' => 'textfield'],
    'email' => ['#type' => 'email'],
  ],
];

function children(array $element): array {
  return array_values(array_filter(array_keys($element), fn($k) => $k[0] !== '#'));
}

function do_build_form(array &$element, array &$leaves): void {
  foreach (children($element) as $key) {
    $child = &$element[$key];
    // #tree is inherited by children unless the child sets its own.
    $child['#tree'] = $child['#tree'] ?? $element['#tree'];
    // THE rule: a nested slot when the PARENT is #tree, a flat one otherwise.
    $child['#parents'] = $element['#tree']
      ? array_merge($element['#parents'] ?? [], [$key])
      : [$key];
    // #array_parents always mirrors the literal array nesting (#ajax uses it).
    $child['#array_parents'] = array_merge($element['#array_parents'] ?? [], [$key]);
    if (children($child) === []) {
      // #name is derived from #parents: first[second][third].
      $child['#name'] = $child['#parents'][0]
        . (count($child['#parents']) > 1
          ? '[' . implode('][', array_slice($child['#parents'], 1)) . ']'
          : '');
      $leaves[$child['#name']] = $child['#parents'];
    }
    do_build_form($child, $leaves);
    unset($child);
  }
}

$leaves = [];
do_build_form($form, $leaves);

echo "element name attribute   #parents (slot in \\$form_state->getValues())\\n";
echo "-----------------------  --------------------------------------------\\n";
foreach ($leaves as $name => $parents) {
  printf("%-23s  [%s]\\n", $name, implode(", ", array_map(fn($p) => "'$p'", $parents)));
}

// What the browser posts, after PHP parses the bracket names.
$input = [
  'title' => 'DB outage',
  'steps' => 'Restart the primary',
  'reporter' => ['name' => 'Ada', 'email' => 'ada@example.test'],
];

// FormBuilder copies input into $form_state->getValues() at each #parents path.
$values = [];
foreach ($leaves as $parents) {
  $ref = &$values;
  $src = $input;
  foreach ($parents as $p) {
    $src = $src[$p] ?? NULL;
    $ref = &$ref[$p];
  }
  $ref = $src;
  unset($ref);
}

echo "\\n\\$form_state->getValues():\\n";
print_r($values);

function get_value(array $values, array|string $key) {
  foreach ((array) $key as $p) {
    if (!is_array($values) || !array_key_exists($p, $values)) {
      return NULL;
    }
    $values = $values[$p];
  }
  return $values;
}

echo "\\n";
foreach ([['steps'], ['diagnostics', 'steps'], ['reporter', 'name'], ['name']] as $key) {
  $shown = "['" . implode("', '", $key) . "']";
  $got = get_value($values, $key);
  printf("getValue(%-26s -> %s\\n", $shown . ')', $got === NULL ? 'NULL' : "'$got'");
}`,
    output: `element name attribute   #parents (slot in $form_state->getValues())
-----------------------  --------------------------------------------
title                    ['title']
steps                    ['steps']
reporter[name]           ['reporter', 'name']
reporter[email]          ['reporter', 'email']

$form_state->getValues():
Array
(
    [title] => DB outage
    [steps] => Restart the primary
    [reporter] => Array
        (
            [name] => Ada
            [email] => ada@example.test
        )

)

getValue(['steps'])                 -> 'Restart the primary'
getValue(['diagnostics', 'steps'])  -> NULL
getValue(['reporter', 'name'])      -> 'Ada'
getValue(['name'])                  -> NULL
`,
  },

  keyPoints: [
    "FormBuilder::getForm() -> buildForm() -> retrieveForm() (your buildForm + form cache lookup) -> prepareForm() (hidden form_id/form_build_id/form_token, #theme, hook_form_alter) -> processForm() -> doBuildForm().",
    "doBuildForm() is the recursive walk that merges #type defaults from element_info, sets #parents/#array_parents/#name/#id, extracts values, runs #process, recurses, then runs #after_build.",
    "#process runs while an element is expanded and may add children (Checkboxes::processCheckboxes); #after_build runs once the element and its children are complete — the last hook before validation and rendering.",
    "Every POST re-enters buildForm(), and $form_state->setRebuild() makes it happen again with values preserved — so buildForm() must be deterministic and side-effect free, with per-build state in $form_state->set().",
    "form_id selects which form's handlers run; form_build_id keys the server-side form cache (key-value-expirable 'form'/'form_state' collections; FormCache::setCache() uses Settings::get('form_cache_expiration', 21600), so six hours unless settings.php overrides it) written when $form_state->setCached() is set — a completely different thing from #cache render caching.",
    "A child's #parents is the parent's #parents + key only when the parent has #tree TRUE (inherited downward); otherwise it flattens to [key] — which is why getValue('steps') works but getValue(['diagnostics','steps']) is NULL.",
  ],

  interview: [
    {
      q: "Walk me through what happens between a POST hitting a Drupal form route and submitForm() running. How is that different from Symfony?",
      a: "The route's \`_form\` default resolves to core's \`HtmlFormController\`, which hands the form object to the \`form_builder\` service. \`FormBuilder::buildForm()\` resolves the form_id, then \`retrieveForm()\` either calls my \`buildForm()\` again or pulls the stored array out of the form cache using the \`form_build_id\` in the POST. \`prepareForm()\` adds the hidden \`form_id\`/\`form_build_id\`/\`form_token\` elements and fires \`hook_form_alter()\`, then \`processForm()\` → \`doBuildForm()\` walks every element to compute \`#parents\`/\`#name\` and extract submitted values, running \`#process\` and \`#after_build\` callbacks along the way. Only then do validation handlers run, and if none set an error, the submit handlers. The Symfony contrast is that there the controller drives it — \`handleRequest()\`, \`isSubmitted() && isValid()\` — over a live \`Form\` object graph, whereas in Drupal the structure is a plain array that gets reconstructed from scratch (or from cache) on every request, and \`FormStateInterface\` carries everything mutable.",
    },
    {
      q: "A colleague adds a counter or a random default value in buildForm() and it behaves oddly on submit. What's going on?",
      a: "\`buildForm()\` is not called once per form — it is called on the GET that renders the form and *again* on the POST, because Drupal has to reconstruct the element structure before it can validate anything against it. If a submit handler calls \`$form_state->setRebuild()\` (multistep, AJAX) it runs a third time. So anything non-deterministic differs between builds: a random \`#default_value\` won't match what was rendered, and side effects like writing a log row or incrementing a counter happen two or three times per submission. The rule is that \`buildForm()\` is a pure function of \`$form_state\` — per-build data goes in \`$form_state->set()\` / \`get()\`, not in class properties, because a new form object is instantiated per request anyway.",
    },
    {
      q: "Explain #tree. When would you set it, and what breaks if you don't?",
      a: "\`#tree\` decides whether a container is a namespace for its children's values. With the default \`#tree => FALSE\`, \`doBuildForm()\` gives every descendant the flat \`#parents\` \`[key]\`, so a textarea inside a \`details\` renders as \`name=\"steps\"\` and reads back as \`$form_state->getValue('steps')\` — the container simply doesn't appear in \`getValues()\`. Set \`#tree => TRUE\` on the container (it's inherited downward) and you get \`name=\"reporter[name]\"\` and \`getValue(['reporter', 'name'])\`, which is what Symfony compound forms do unconditionally. I turn it on for anything repeated or reusable — a table of rows, a group added multiple times — because with \`#tree\` FALSE two identically-named elements in different containers collide in one value slot and the last one wins. The gotcha to remember is that \`#array_parents\` never changes: it always mirrors the literal array, which is what \`#ajax\` callbacks use to find the element they must return.",
    },
    {
      q: "Where does Drupal store a form between the render and the submit, and how is that different from #cache?",
      a: "Normally nothing is stored — the form is rebuilt from \`buildForm()\`. But when a build can't be reproduced (AJAX, elements added by a rebuild, \`#process\` output that depends on prior input) the form is cached server-side: \`$form_state->setCached()\` (which throws on a GET request, since caching state on a safe method is a side effect), and \`FormCache\` writes the built array and the \`FormState\` into the key-value-expirable \`form\` and \`form_state\` collections keyed by the \`form_build_id\` hidden field, for six hours by default — \`FormCache::setCache()\` reads \`Settings::get('form_cache_expiration', 21600)\`, so \`$settings['form_cache_expiration']\` in settings.php can retune it. What gets stored is the structure as it was *before* \`doBuildForm()\` ran — core deliberately keeps an \`$unprocessed_form\` copy, because \`doBuildForm()\` has to run on every request to map the new input. So on the next POST the build_id restores that pre-process structure and it is walked again: \`#process\` and \`#after_build\` both fire. What the cache hit skips is \`retrieveForm()\` and \`prepareForm()\`, so my \`buildForm()\` and \`hook_form_alter()\` do not run again for that build. That is completely separate from \`#cache\` on a render array, which is the render cache with keys, contexts, tags and max-age — same array, two unrelated caching systems, and mixing them up in an interview is a giveaway.",
    },
  ],

  quiz: [
    {
      question:
        "$form['diagnostics'] is a details element with no #tree, containing $form['diagnostics']['steps']. How do you read the submitted value?",
      options: [
        "$form_state->getValue(['diagnostics', 'steps'])",
        "$form_state->getValue('steps')",
        "$form['diagnostics']['steps']['#value']",
        "$form_state->getValue('diagnostics')['steps']",
      ],
      answerIndex: 1,
      explain:
        "#tree defaults to FALSE, so doBuildForm() gives the child the flat #parents ['steps'] — the container never appears in the values array, and the rendered input is name=\"steps\". Add '#tree' => TRUE to the details element and the answer flips to getValue(['diagnostics', 'steps']).",
    },
    {
      question: "Why does FormBuilder call your buildForm() again on the POST request?",
      options: [
        "To re-render the form for the user after submission",
        "Because the form object graph is serialized into the session and must be woken up",
        "Because Drupal keeps no structure between requests — it must rebuild the element tree before it can map input onto elements and validate it",
        "It doesn't; buildForm() runs only on GET, and submitForm() reads $_POST directly",
      ],
      answerIndex: 2,
      explain:
        "The form is a plain array, gone at the end of the request. To know that 'severity' is a select with a fixed #options list, that a value must pass through a value callback, or which handlers exist, FormBuilder must have the structure again — so it rebuilds it (or restores it from the form cache) before validating. Hence the rule that buildForm() must be deterministic and side-effect free.",
    },
    {
      question: "What is the difference between form_id and form_build_id in the POSTed hidden fields?",
      options: [
        "form_id is the CSRF token; form_build_id is the form's machine name",
        "form_id identifies which form's build/validate/submit handlers to run; form_build_id identifies this particular build and is the key into the form cache",
        "They are the same value, duplicated for backwards compatibility",
        "form_build_id is the render cache key for #cache metadata",
      ],
      answerIndex: 1,
      explain:
        "form_id comes from getFormId() and tells FormBuilder which form is being submitted. form_build_id is a random 'form-…' token minted per build; if that build was cached ($form_state->setCached(), automatic with #ajax), FormCache restores the stored pre-process structure from the key-value-expirable 'form' collection — core caches the form as it was before doBuildForm(), so the restored build is still walked and re-processed on the new request. CSRF is the separate form_token field.",
    },
    {
      question:
        "You need to add child elements to a custom element based on its #options, and separately to inspect the fully built subtree before rendering. Which callbacks?",
      options: [
        "#pre_render for both",
        "#after_build to add children, #process to inspect",
        "#process to add children, #after_build to inspect the finished tree",
        "hook_form_alter() for both — element callbacks only affect rendering",
      ],
      answerIndex: 2,
      explain:
        "doBuildForm() runs #process while expanding the element — before its children are walked — which is exactly why Checkboxes::processCheckboxes() can turn one element into N children. #after_build runs after the element and all descendants are built, so it sees the finished structure. #pre_render belongs to the Render API, later in the pipeline, and hook_form_alter() fires once in prepareForm() on the whole form.",
    },
  ],
};

export default lesson;
