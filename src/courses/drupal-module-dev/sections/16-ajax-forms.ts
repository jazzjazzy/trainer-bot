import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "ajax-forms",
  title: "AJAX in Forms: #ajax Without Writing JavaScript",
  part: "Forms & Config",
  estMinutes: 13,
  summary:
    "Make incident_tracker's category select drive the severity options with #ajax — a server-side form rebuild plus a callback that returns one fragment (or an AjaxResponse of commands), with #states for the zero-round-trip cases.",

  concept: `
In Symfony, a "dynamic form" is a two-part job: form events on the server
(\`PRE_SET_DATA\` / \`POST_SUBMIT\`) plus frontend code you write and ship —
a Stimulus \`fetch()\`, or adopting UX Live Components / Turbo. Drupal ships
the frontend half in core. Put an \`#ajax\` array on any form element and
core's \`drupal.ajax\` library binds the event, serializes the form, POSTs it,
and applies the response. You write zero JavaScript.

### What actually happens on the wire

When the \`change\` event fires on our category select, core JS POSTs the
**entire form** — every current value plus the form build id — back to the
same route with \`_wrapper_format=drupal_ajax\`. Server-side, FormBuilder
reruns the whole lifecycle — and \`buildForm()\` actually runs **twice**: once
before any values exist (that pass exists so the incoming input can be
validated against the options the browser already had), then again inside
\`rebuildForm()\`, where \`$form_state->getValue('category')\` is populated and
the new \`#options\` are built. Only then does your \`#ajax\` callback run —
**last** — and it receives that second, rebuilt form.
Its job is to pick a piece out of the already-rebuilt form and return it. Core
JS swaps that fragment into the DOM element whose HTML id matches the
\`wrapper\` key. The right mental model is Symfony UX Live Components (state
lives server-side, the server re-renders over AJAX), not hand-written
\`fetch()\`.

### Dependent dropdowns: the canonical pattern

Category → severity has three moving parts:

- **The trigger**: \`'#ajax' => ['callback' => '::updateSeverityOptions',
  'wrapper' => 'severity-wrapper', 'event' => 'change']\` on the category
  select. Optional keys: \`progress\` (throbber/bar), \`method\` (jQuery method,
  default \`replaceWith\`; the legacy alias \`replace\` was deprecated in 10.3.0
  and removed in 11.0 — always write \`replaceWith\`), \`effect\`.
- **The dependent element**: severity computes its \`#options\` from
  \`$form_state->getValue('category')\` *inside* \`buildForm()\` — because
  \`buildForm()\` is what re-runs on every AJAX request. Wrap it in
  \`'#prefix' => '<div id="severity-wrapper">'\` / \`'#suffix' => '</div>'\`
  so the wrapper id survives each replacement.
- **The callback**: deliberately dumb — \`return $form['severity'];\`.

The classic mistake is computing the new options in the callback. That renders
once, but the form the user eventually *submits* is validated against what
\`buildForm()\` produced during the rebuild: Drupal writes that rebuilt
structure to the form cache under a fresh \`form_build_id\` and ships an
\`UpdateBuildIdCommand\` so the browser's hidden field adopts it, and the final
POST is then served straight from that cache — your \`buildForm()\` is not even
called. So \`buildForm()\` must be the single source of truth, and the callback
just selects from it.

### AjaxResponse: multiple commands

Returning a render array is shorthand for a single replace. When one fragment
is not enough, return \`Drupal\\Core\\Ajax\\AjaxResponse\` and add commands:
\`ReplaceCommand\` (selector + render array), \`MessageCommand\` (put a status
or error message in the page's messages region), \`InvokeCommand\` (call any
jQuery method — or your own \`$.fn\` plugin — on a selector), plus
\`HtmlCommand\`, \`RedirectCommand\`, \`OpenModalDialogCommand\` and friends.
Each serializes to a JSON object like \`{"command":"insert","method":
"replaceWith",...}\` that core JS executes in order — Drupal's Turbo Streams.
The \`#ajax\` API itself is identical in Drupal 10 and 11.

### #states: when there is no server work to do

If the reaction is purely cosmetic — show/hide, enable/disable, require in the
UI — skip the round-trip entirely: \`#states\` declares the behavior as array
config and core's \`drupal.states\` JS applies it client-side. Rule of thumb:
\`#states\` when the browser already has everything it needs; \`#ajax\` when
the server must compute something. And since \`#states\` enforces nothing
server-side, real rules still belong in \`validateForm()\`.
`,

  comparisons: [
    {
      label: "Dependent dropdown: form events + your JS vs #ajax",
      intro:
        "Category should drive the severity choices. Symfony rebuilds the field with form events — and still needs frontend code to re-POST and swap HTML. Drupal wires everything from one #ajax array; core ships the JavaScript.",
      php: `<?php
// Symfony: the documented "dynamic form" recipe — server half only.
use Symfony\\Component\\Form\\FormEvent;
use Symfony\\Component\\Form\\FormEvents;
use Symfony\\Component\\Form\\FormInterface;

class IncidentType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder->add('category', ChoiceType::class, [
            'choices' => [
                'Infrastructure' => 'infrastructure',
                'Application' => 'application',
                'Security' => 'security',
            ],
        ]);

        $addSeverity = function (FormInterface $form, string $category): void {
            $form->add('severity', ChoiceType::class, [
                'choices' => $this->severityChoicesFor($category),
            ]);
        };

        $builder->addEventListener(FormEvents::PRE_SET_DATA,
            fn (FormEvent $e) => $addSeverity($e->getForm(), 'infrastructure'));

        // Re-add the field with new choices after 'category' submits.
        $builder->get('category')->addEventListener(FormEvents::POST_SUBMIT,
            fn (FormEvent $e) => $addSeverity(
                $e->getForm()->getParent(),
                (string) $e->getForm()->getData(),
            ));
    }
}
// ...and you STILL write the frontend: a Stimulus controller that
// fetches the re-rendered form and swaps the severity row's HTML
// (or you adopt UX Live Components / Turbo to do it for you).`,
      ts: `<?php
// Drupal: IncidentReportForm::buildForm() — re-runs on every AJAX request.
public function buildForm(array $form, FormStateInterface $form_state): array {
  $form['category'] = [
    '#type' => 'select',
    '#title' => $this->t('Category'),
    '#options' => [
      'infrastructure' => $this->t('Infrastructure'),
      'application' => $this->t('Application'),
      'security' => $this->t('Security'),
    ],
    '#ajax' => [
      'callback' => '::updateSeverityOptions',
      'wrapper' => 'severity-wrapper',
      'event' => 'change',
      'progress' => ['type' => 'throbber', 'message' => $this->t('Updating...')],
    ],
  ];

  // On the AJAX rebuild the user's pick is already in $form_state.
  $category = $form_state->getValue('category') ?? 'infrastructure';

  $form['severity'] = [
    '#type' => 'select',
    '#title' => $this->t('Severity'),
    '#options' => $this->severityOptionsFor($category),
    // The id core's JS targets — #prefix/#suffix keep it on the
    // element so it survives every replacement.
    '#prefix' => '<div id="severity-wrapper">',
    '#suffix' => '</div>',
  ];

  $form['actions']['submit'] = [
    '#type' => 'submit',
    '#value' => $this->t('Save incident'),
  ];
  return $form;
}`,
      note: "No FormEvents, no Stimulus, no fetch(): the #ajax array IS the wiring. Core serializes the whole form, POSTs it back to the same route, reruns buildForm() with the new values, and swaps the callback's return into #severity-wrapper.",
    },
    {
      label: "The callback: pick the fragment, don't build it",
      intro:
        "Symfony UX Live Components is the closest analogue: writable server-side state, automatic re-render over AJAX. Drupal's callback runs after the form has already been rebuilt — so it just returns the piece to swap.",
      php: `<?php
// Symfony UX Live Components: state lives server-side; changing a
// bound prop re-renders the component over AJAX automatically.
use Symfony\\UX\\LiveComponent\\Attribute\\AsLiveComponent;
use Symfony\\UX\\LiveComponent\\Attribute\\LiveProp;
use Symfony\\UX\\LiveComponent\\DefaultActionTrait;

#[AsLiveComponent('incident_form')]
class IncidentFormComponent
{
    use DefaultActionTrait;

    #[LiveProp(writable: true)]
    public string $category = 'infrastructure';

    /** Recomputed on every re-render — like buildForm() on rebuild. */
    public function getSeverityChoices(): array
    {
        return match ($this->category) {
            'security' => ['High' => 'high', 'Critical' => 'critical'],
            'application' => ['Low' => 'low', 'High' => 'high'],
            default => ['Low' => 'low', 'High' => 'high', 'Critical' => 'critical'],
        };
    }
}
// Twig: <select data-model="category"> — each change POSTs the
// component state and the server re-renders the template.`,
      ts: `<?php
// Drupal: the #ajax callback runs LAST — after buildForm() re-ran,
// elements were processed, and validation happened with the new input.
public function updateSeverityOptions(array &$form, FormStateInterface $form_state): array {
  // Nothing to compute: buildForm() already produced the new options.
  // Return the piece that replaces the element with id severity-wrapper.
  return $form['severity'];
}

// The single source of truth, used by buildForm() on the first GET
// AND on every AJAX rebuild.
private function severityOptionsFor(string $category): array {
  return match ($category) {
    'security' => [
      'high' => $this->t('High'),
      'critical' => $this->t('Critical'),
    ],
    'application' => [
      'low' => $this->t('Low'),
      'high' => $this->t('High'),
    ],
    default => [
      'low' => $this->t('Low'),
      'high' => $this->t('High'),
      'critical' => $this->t('Critical'),
    ],
  };
}`,
      note: "Keep option logic in buildForm(), never in the callback: the form the user finally submits is validated against what buildForm() produced. A callback that invents markup buildForm() doesn't know about makes render and validation disagree.",
    },
    {
      label: "Multiple targets: Turbo Streams vs AjaxResponse commands",
      intro:
        "Sometimes one swapped fragment isn't enough — you also want a status message and a CSS-class change. Symfony answers with a stream of <turbo-stream> actions; Drupal with an AjaxResponse carrying typed commands.",
      php: `<?php
// Symfony + UX Turbo: return a stream of actions; Turbo's JS applies
// each one to its target element.
use Symfony\\UX\\Turbo\\TurboBundle;

public function updateSeverity(Request $request): Response
{
    $category = (string) $request->request->get('category');

    $request->setRequestFormat(TurboBundle::STREAM_FORMAT);
    return $this->render('incident/severity.stream.html.twig', [
        'options' => $this->severityChoicesFor($category),
        'category' => $category,
    ]);
}

// severity.stream.html.twig — one action per target:
// <turbo-stream action="replace" target="severity-wrapper">
//   <template>{# re-rendered select #}</template>
// </turbo-stream>
// <turbo-stream action="append" target="flash-messages">
//   <template><div class="alert">Options updated.</div></template>
// </turbo-stream>`,
      ts: `<?php
// Drupal: same idea — an ordered list of commands core's JS executes.
use Drupal\\Core\\Ajax\\AjaxResponse;
use Drupal\\Core\\Ajax\\InvokeCommand;
use Drupal\\Core\\Ajax\\MessageCommand;
use Drupal\\Core\\Ajax\\ReplaceCommand;

public function updateSeverityOptions(array &$form, FormStateInterface $form_state): AjaxResponse {
  $category = (string) $form_state->getValue('category');

  $response = new AjaxResponse();
  // 1. What returning the render array would have done for you.
  $response->addCommand(new ReplaceCommand('#severity-wrapper', $form['severity']));
  // 2. A status message in the page's messages region.
  $response->addCommand(new MessageCommand(
    $this->t('Severity options updated for @category.', ['@category' => $category]),
    NULL,
    ['type' => 'status'],
  ));
  // 3. Any jQuery method (or your own $.fn plugin) on a selector.
  $response->addCommand(new InvokeCommand('#incident-tracker-report', 'addClass', ['is-updated']));
  return $response;
}`,
      note: "Each command serializes to JSON ({command, selector, ...}) that drupal.ajax executes in order. Others include HtmlCommand, RedirectCommand, and OpenModalDialogCommand. Return a render array for the 90% case; reach for AjaxResponse when you need several targets.",
    },
    {
      label: "#states: zero round-trip, zero JS written",
      intro:
        "Pure show/hide needs no server at all. In Symfony you write and ship a Stimulus controller; in Drupal you declare #states and core's drupal.states library does the toggling.",
      php: `<?php
// Symfony: client-side reveal means writing a Stimulus controller.
$builder->add('followUp', CheckboxType::class, [
    'required' => false,
    'label' => 'Schedule a post-mortem',
    'row_attr' => [
        'data-controller' => 'reveal',
        'data-action' => 'change->reveal#toggle',
    ],
]);
$builder->add('postmortemDate', DateType::class, [
    'required' => false,
    'row_attr' => ['data-reveal-target' => 'panel', 'hidden' => 'hidden'],
]);

// assets/controllers/reveal_controller.js — you write and ship this:
//   import { Controller } from '@hotwired/stimulus';
//   export default class extends Controller {
//     static targets = ['panel'];
//     toggle(event) {
//       this.panelTarget.hidden = !event.target.checked;
//     }
//   }`,
      ts: `<?php
// Drupal: declare the behavior; core's drupal.states JS implements it.
$form['follow_up'] = [
  '#type' => 'checkbox',
  '#title' => $this->t('Schedule a post-mortem'),
];
$form['postmortem_date'] = [
  '#type' => 'date',
  '#title' => $this->t('Post-mortem date'),
  '#states' => [
    'visible' => [
      ':input[name="follow_up"]' => ['checked' => TRUE],
    ],
    'required' => [
      ':input[name="follow_up"]' => ['checked' => TRUE],
    ],
  ],
];

// No round-trip, no callback, no rebuild. But also no enforcement:
// a #states 'required' is UI-only, and hidden elements still POST
// their values — the real rule belongs in validateForm().`,
      note: "Decision rule: #states when the browser already has everything it needs (visibility, enabling, UI-required); #ajax when the server must compute something (options from config or the database, entity lookups, saved state).",
    },
  ],

  playground: {
    intro:
      "The #ajax round-trip in ~50 lines: the change event POSTs the whole form, buildForm() re-runs with the new input, and the callback just picks out the fragment — then the same trigger shown as an AjaxResponse command list. Predict all three blocks.",
    lang: "php",
    code: `<?php
// The #ajax round-trip in miniature. Key fact: every interaction POSTs the
// WHOLE form back, the server REBUILDS it (buildForm runs again with the
// user's input), and only then does the callback pick the piece to return.

function severity_options(string $category): array {
  return match ($category) {
    'security' => ['high' => 'High', 'critical' => 'Critical'],
    'application' => ['low' => 'Low', 'high' => 'High'],
    default => ['low' => 'Low', 'high' => 'High', 'critical' => 'Critical'],
  };
}

// buildForm(): runs on the first GET *and* again on every AJAX request.
function build_form(array $values): array {
  $category = $values['category'] ?? 'infrastructure';
  return [
    'category' => [
      '#type' => 'select',
      '#options' => ['infrastructure' => 1, 'application' => 1, 'security' => 1],
      '#ajax' => ['callback' => 'update_severity', 'wrapper' => 'severity-wrapper', 'event' => 'change'],
    ],
    'severity' => [
      '#type' => 'select',
      '#options' => severity_options($category),
      '#prefix' => '<div id="severity-wrapper">',
      '#suffix' => '</div>',
    ],
  ];
}

// The #ajax callback: the form is ALREADY rebuilt — just pick the piece out.
function update_severity(array $form): array {
  return $form['severity'];
}

function render_fragment(array $el): string {
  $options = implode('|', array_keys($el['#options']));
  return $el['#prefix'] . "<select>{$options}</select>" . $el['#suffix'];
}

// 1. Initial GET: no input yet, category falls back to the default.
$form = build_form([]);
echo "GET /incidents/report\\n";
echo '  severity options: ' . implode(', ', array_keys($form['severity']['#options'])) . "\\n\\n";

// 2. User picks Security -> core's ajax.js POSTs the whole form back.
echo "AJAX POST (change fired on category = security)\\n";
$post = ['category' => 'security', 'severity' => 'low'];
$form = build_form($post);           // FormBuilder rebuilds FIRST...
$fragment = update_severity($form);  // ...then the callback runs LAST.
echo '  callback returned: ' . render_fragment($fragment) . "\\n\\n";

// 3. The same callback could return commands instead of one fragment.
echo "AjaxResponse commands (the JSON core's JS executes in order)\\n";
$commands = [
  ['command' => 'insert', 'method' => 'replaceWith', 'selector' => '#severity-wrapper'],
  ['command' => 'message', 'message' => 'Severity options updated for security.'],
  ['command' => 'invoke', 'selector' => '#incident-tracker-report', 'method' => 'addClass', 'args' => ['is-updated']],
];
foreach ($commands as $command) {
  echo '  ' . json_encode($command) . "\\n";
}`,
    output: `GET /incidents/report
  severity options: low, high, critical

AJAX POST (change fired on category = security)
  callback returned: <div id="severity-wrapper"><select>high|critical</select></div>

AjaxResponse commands (the JSON core's JS executes in order)
  {"command":"insert","method":"replaceWith","selector":"#severity-wrapper"}
  {"command":"message","message":"Severity options updated for security."}
  {"command":"invoke","selector":"#incident-tracker-report","method":"addClass","args":["is-updated"]}
`,
  },

  keyPoints: [
    "'#ajax' => ['callback' => '::updateSeverityOptions', 'wrapper' => 'severity-wrapper', 'event' => 'change'] on the trigger element gives you AJAX with zero custom JavaScript — core ships the client half (drupal.ajax).",
    "Every AJAX interaction POSTs the entire form back and the server rebuilds it: buildForm() runs again with the user's input, so dependent #options logic belongs in buildForm() via $form_state->getValue('category'), never in the callback.",
    "The callback runs last — after rebuild and validation — and just returns the fragment (return $form['severity'];) that core JS swaps into the DOM element whose id matches 'wrapper', kept on the element via #prefix/#suffix.",
    "When one fragment isn't enough, return an AjaxResponse and addCommand(): ReplaceCommand, MessageCommand, InvokeCommand (plus HtmlCommand, RedirectCommand, OpenModalDialogCommand...) — an ordered JSON command list, Drupal's Turbo Streams.",
    "The #ajax 'method' key takes a jQuery method name and defaults to 'replaceWith'; the old accepted alias 'replace' was deprecated in Drupal 10.3 and removed in 11.0 — otherwise #ajax is identical across Drupal 10 and 11.",
    "#states covers pure client-side show/hide/enable/require from array config with no round-trip — but enforces nothing server-side, so real rules stay in validateForm(); use #ajax whenever the server must compute something.",
  ],

  interview: [
    {
      q: "A user changes a select that has an #ajax property. Walk me through what happens, end to end.",
      a: "Core's \`drupal.ajax\` library has bound the configured event (\`change\` here) to the element. When it fires, the JS serializes the **whole form** — all current values plus the form build id — and POSTs it back to the same form route with \`_wrapper_format=drupal_ajax\`. Server-side, FormBuilder reruns the full lifecycle: \`buildForm()\` executes again with the user's input available in \`$form_state\`, elements are processed, validation runs — and only then is the \`#ajax\` callback invoked, last. The callback returns either a render array, which core JS swaps into the element whose HTML id matches the \`wrapper\` key, or an \`AjaxResponse\` of commands executed in order. The right analogy for a Symfony developer is UX Live Components — server-side state re-rendered over AJAX — not a hand-written \`fetch()\`.",
    },
    {
      q: "How do you build a dependent dropdown — say category driving severity options — and why must the option logic live in buildForm() rather than the AJAX callback?",
      a: "Put \`#ajax\` (callback, wrapper, event) on the category select; give the severity element \`'#prefix' => '<div id=\\\"severity-wrapper\\\">'\` and a matching \`#suffix\` so the wrapper id survives replacement; and compute severity's \`#options\` from \`$form_state->getValue('category')\` inside \`buildForm()\`. The callback is then one line: \`return $form['severity'];\`. The logic must live in \`buildForm()\` because that's what re-runs on the AJAX rebuild, and Drupal caches that rebuilt structure — a new \`form_build_id\` is pushed into the DOM by \`UpdateBuildIdCommand\` — so the final POST is validated against exactly the options the rebuild declared. (On that final POST \`FormBuilder::buildForm()\` finds the cached form by its build id and never calls your \`buildForm()\` at all.) If the callback invented options that \`buildForm()\` doesn't know about, the AJAX render and the eventual validation would disagree, giving 'illegal choice' errors.",
    },
    {
      q: "When would you return an AjaxResponse instead of a render array from an #ajax callback, and what commands would you use?",
      a: "A render array is shorthand for a single replace of the \`wrapper\` element — perfect for the dependent-dropdown case. Return \`AjaxResponse\` when the interaction needs to touch multiple places: \`ReplaceCommand('#severity-wrapper', $form['severity'])\` for the fragment, \`MessageCommand()\` to drop a status or error message into the page's messages region, \`InvokeCommand($selector, 'addClass', ['is-updated'])\` to call any jQuery method or a custom \`$.fn\` plugin, plus \`HtmlCommand\`, \`RedirectCommand\`, and dialog commands. Each command serializes to a small JSON object that \`drupal.ajax\` executes in order — conceptually the same as returning several \`<turbo-stream>\` actions from a Symfony controller.",
    },
    {
      q: "You need a field to appear only when a checkbox is ticked. #states or #ajax — and why?",
      a: "\`#states\` — the browser already has everything it needs, so a server round-trip buys nothing. You declare \`'visible' => [':input[name=\\\"follow_up\\\"]' => ['checked' => TRUE]]\` on the element and core's \`drupal.states\` library toggles it client-side; in Symfony that's a Stimulus controller you'd write yourself. Reach for \`#ajax\` only when the server must compute something — options from config or the database, an entity lookup, saving intermediate state. And because \`#states\` is UI-only (hidden elements still POST, its 'required' isn't enforced server-side), any rule that matters is duplicated in \`validateForm()\`.",
    },
  ],

  quiz: [
    {
      question: "In '#ajax' => ['callback' => '::updateSeverityOptions', 'wrapper' => 'severity-wrapper', ...], what does 'wrapper' refer to?",
      options: [
        "The name of a Twig template that wraps the response",
        "The HTML id of the DOM element that core's JS replaces with whatever the callback returns",
        "The form element key under which the callback's return value is stored in $form",
        "A CSS class added to the element while the request is in flight",
      ],
      answerIndex: 1,
      explain:
        "'wrapper' is a DOM id. The dependent element carries it via '#prefix' => '<div id=\"severity-wrapper\">' / '#suffix' => '</div>' so the id is part of the swapped markup and survives every replacement. Core's ajax.js takes the callback's returned render array, renders it, and applies the 'method' (default jQuery replaceWith) against that element.",
    },
    {
      question: "During an AJAX request triggered by the category select, what has already happened by the time updateSeverityOptions() runs?",
      options: [
        "Nothing — the callback is the entry point and must build the new element itself",
        "Only the triggering element was submitted; the rest of the form is untouched",
        "The whole form was POSTed back and rebuilt: buildForm() re-ran with the new input, then processing and validation",
        "The browser already swapped the wrapper; the callback just confirms it",
      ],
      answerIndex: 2,
      explain:
        "Drupal AJAX is a full server-side form rebuild: the entire form state is POSTed to the same route, FormBuilder calls buildForm() again (where $form_state->getValue('category') now returns the new pick), elements are processed and validated, and the #ajax callback runs last. That's why the callback can be a one-liner returning $form['severity'] — the work already happened.",
    },
    {
      question: "Where must the logic that maps a category to its severity #options live?",
      options: [
        "In the AJAX callback, since that's what responds to the change event",
        "In buildForm(), reading $form_state->getValue('category') — the callback only returns the rebuilt element",
        "In a hook_form_alter() implementation, so other modules can see it",
        "In JavaScript attached via #attached, since options are client-side",
      ],
      answerIndex: 1,
      explain:
        "buildForm() re-runs on every AJAX request and the rebuilt form is cached, so the final submission is validated against those same options. Logic placed only in the callback would render once but desynchronize render from validation ('illegal choice' errors). The callback stays dumb: return $form['severity'];",
    },
    {
      question: "Your callback should swap the severity select AND show a status message AND add a CSS class to the form. What do you return?",
      options: [
        "Three render arrays in a list — FormBuilder applies each one",
        "A render array with #attached JavaScript that does the message and class",
        "An AjaxResponse with ReplaceCommand, MessageCommand, and InvokeCommand added in order",
        "Nothing — set $form_state->setRebuild(TRUE) and let the full page refresh",
      ],
      answerIndex: 2,
      explain:
        "A plain render array only ever produces one replace of the wrapper element. For multiple targets, return an AjaxResponse and addCommand() each step: ReplaceCommand('#severity-wrapper', $form['severity']), MessageCommand($this->t('...')), InvokeCommand('#incident-tracker-report', 'addClass', ['is-updated']). Core's JS executes the serialized command list in order — the Turbo Streams of Drupal.",
    },
  ],
};

export default lesson;
