import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "multistep-wizards",
  title: "Multi-Step Wizards & Temporary Storage",
  part: "Form API in Depth",
  estMinutes: 13,
  summary:
    "Build the incident wizard twice — once as one form class driven by setRebuild() plus a step counter in form storage, once as three routes sharing PrivateTempStore — and learn when the form cache's six-hour lifetime forces the second design.",

  concept: `
A wizard is just a form that refuses to finish. Drupal gives you two engines for
that, and picking the wrong one is the classic multi-step bug.

## Engine 1: one form class, setRebuild(TRUE)

\`FormBuilder\` normally does validate → submit → redirect. Call
\`$form_state->setRebuild(TRUE)\` in a submit handler and the redirect never
happens: \`buildForm()\` is called again in the same request and the fresh markup
is what the browser gets back. Keep a step counter in **form storage** —
\`$form_state->set('step', 2)\` — branch on it at the top of \`buildForm()\`, and
merge each step's values into \`$form_state->set('data', …)\` as you go. The last
step's submit handler is the only one that persists anything and the only one
that omits \`setRebuild()\`, so the usual redirect finally fires.

Storage survives the round trip because a rebuilt form is written to the
expirable key-value collections \`form\` and \`form_state\`, keyed by the hidden
\`form_build_id\` field that gets re-issued on every rebuild. That is the catch:
core's \`FormCache\` stamps those entries with a **six-hour** default lifetime
(\`Settings::get('form_cache_expiration', 21600)\`, retunable from settings.php).
Leave the wizard open over lunch and the next POST finds no cached
build — Drupal treats it as a stale form and you get "The form has become
outdated" plus a silent restart. Also note \`$form_state->setCached(TRUE)\`
throws a \`LogicException\` on a GET-method form: caching form state is a
side-effect that GET is not allowed to have.

## Engine 2: separate routes, PrivateTempStore

Rebuild only works while you stay on one route and one POST cycle. The moment a
step redirects — its own URL, its own form class, a file upload in between, a
"resume later" link — the form cache is gone with it. Then you want
\`PrivateTempStore\`: inject \`tempstore.private\`
(\`PrivateTempStoreFactory\`), call \`->get('incident_tracker')\` for a
namespaced collection, and \`set()\` / \`get()\` / \`delete()\` a plain array.
Keys are automatically scoped to the owner (user ID, or the session for
anonymous users — the store starts a session for them), so two people never
collide. Default expiry is one week, from the \`tempstore.expire\` parameter, and
you can raise it in \`sites/default/services.yml\`.

## Back buttons and #limit_validation_errors

Step 2's "Back" button must not trip step 2's required fields. Give it
\`'#limit_validation_errors' => []\` and a dedicated \`'#submit' => ['::backStep']\`
handler: nothing is validated, and — the part people miss — every value outside
the limited sections is **stripped from \`getValues()\`** before your handler
runs. So a Back handler reads storage or tempstore, never
\`$form_state->getValue()\`. Always pair \`#limit_validation_errors\` with an
explicit \`#submit\`, or the normal submit handlers run against half-empty
values. Same trick for "Save draft" — limit validation to the one element you
actually care about: \`[['title']]\`.
`,

  comparisons: [
    {
      label: "One class, N steps: session juggling vs setRebuild()",
      intro:
        "Three questions, one URL. Symfony keeps the accumulated answers in the session and picks a FormType per step; Drupal keeps them in form storage and re-enters buildForm() through setRebuild(TRUE).",
      php: `<?php
// Symfony: one action, a step in the session, one FormType per step.
#[Route('/incidents/report', name: 'incident_report')]
public function report(Request $request): Response
{
    $session = $request->getSession();
    $step = $session->get('incident_step', 1);
    $data = $session->get('incident_data', []);

    $types = [1 => BasicsType::class, 2 => ImpactType::class, 3 => ReviewType::class];
    $form = $this->createForm($types[$step], $data);
    $form->handleRequest($request);

    if ($form->isSubmitted() && $form->isValid()) {
        $data = array_merge($data, $form->getData());
        if ($step < 3) {
            $session->set('incident_step', $step + 1);
            $session->set('incident_data', $data);
            // PRG: redirect back to this same route to show the next step.
            return $this->redirectToRoute('incident_report');
        }
        $this->save($data);
        $session->remove('incident_step');
        $session->remove('incident_data');
        return $this->redirectToRoute('incident_list');
    }

    return $this->render('incident/wizard.html.twig', [
        'form' => $form, 'step' => $step,
    ]);
}`,
      ts: `<?php
// Drupal: src/Form/IncidentWizardForm.php — one class, one route.
namespace Drupal\\incident_tracker\\Form;

use Drupal\\Core\\Form\\FormBase;
use Drupal\\Core\\Form\\FormStateInterface;

class IncidentWizardForm extends FormBase {

  public function getFormId(): string {
    return 'incident_tracker_wizard';
  }

  public function buildForm(array $form, FormStateInterface $form_state): array {
    // Form storage is the wizard's memory; it survives each rebuild.
    $step = $form_state->get('step') ?? 1;
    $data = $form_state->get('data') ?? [];
    $form_state->set('step', $step);

    $form['progress'] = [
      '#markup' => $this->t('Step @n of 3', ['@n' => $step]),
    ];

    if ($step === 1) {
      $form['title'] = [
        '#type' => 'textfield',
        '#title' => $this->t('Title'),
        '#required' => TRUE,
        '#default_value' => $data['title'] ?? '',
      ];
      $form['severity'] = [
        '#type' => 'select',
        '#title' => $this->t('Severity'),
        '#options' => [
          'low' => $this->t('Low'),
          'high' => $this->t('High'),
          'critical' => $this->t('Critical'),
        ],
        '#required' => TRUE,
        '#default_value' => $data['severity'] ?? 'low',
      ];
    }
    elseif ($step === 2) {
      $form['impact'] = [
        '#type' => 'textarea',
        '#title' => $this->t('Customer impact'),
        '#required' => TRUE,
        '#default_value' => $data['impact'] ?? '',
      ];
    }
    else {
      $form['review'] = [
        '#theme' => 'item_list',
        '#items' => array_map(
          fn ($k, $v) => $k . ': ' . $v,
          array_keys($data),
          $data,
        ),
      ];
    }

    $form['actions'] = ['#type' => 'actions'];
    if ($step > 1) {
      $form['actions']['back'] = [
        '#type' => 'submit',
        '#value' => $this->t('Back'),
        '#limit_validation_errors' => [],
        '#submit' => ['::backStep'],
      ];
    }
    $form['actions']['submit'] = [
      '#type' => 'submit',
      '#value' => $step < 3 ? $this->t('Next') : $this->t('File incident'),
    ];
    return $form;
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $step = $form_state->get('step');
    $data = ($form_state->get('data') ?? []) + [];
    // cleanValues() drops form_build_id / form_token / op before merging.
    $data = array_merge($data, $form_state->cleanValues()->getValues());
    $form_state->set('data', $data);

    if ($step < 3) {
      $form_state->set('step', $step + 1);
      // No redirect: buildForm() runs again with the new step.
      $form_state->setRebuild(TRUE);
      return;
    }

    $this->saveIncident($data);
    $this->messenger()->addStatus($this->t('Incident filed.'));
    $form_state->setRedirect('incident_tracker.list');
  }
}`,
      note: "setRebuild(TRUE) is the whole trick: it cancels the redirect and re-enters buildForm() with storage intact. Symfony has to redirect between steps and therefore has to use the session from the start.",
    },
    {
      label: "The Back button that must not validate",
      intro:
        "Step 2 has a required textarea. Clicking Back should never complain about it. Symfony has no per-button validation switch, so you either make Back a plain link or use validation_groups; Drupal has #limit_validation_errors.",
      php: `<?php
// Symfony: buttons don't carry validation scopes, so either…

// (a) Back is not a submit at all — just a GET link, and the step counter
//     moves in a tiny controller action:
#[Route('/incidents/report/back', name: 'incident_report_back')]
public function back(Request $request): Response
{
    $session = $request->getSession();
    $session->set('incident_step', max(1, $session->get('incident_step', 1) - 1));
    return $this->redirectToRoute('incident_report');
}

// (b) …or you swap the validation group per clicked button:
$builder
    ->add('back', SubmitType::class, [
        'validation_groups' => false,   // validate nothing for this button
    ])
    ->add('next', SubmitType::class, [
        'validation_groups' => ['step2'],
    ]);

// Note (a) loses whatever the user typed on step 2 — same trade-off Drupal
// makes when it strips values for a limited-validation button.`,
      ts: `<?php
// Drupal: the scope lives on the button itself.
$form['actions']['back'] = [
  '#type' => 'submit',
  '#value' => $this->t('Back'),
  // [] = validate nothing at all. A non-empty array limits validation to
  // those element paths, e.g. [['title']] or [['contact', 'email']].
  '#limit_validation_errors' => [],
  // Required in practice: without its own #submit, the form's normal submit
  // handlers would run against the stripped-down values.
  '#submit' => ['::backStep'],
];

public function backStep(array &$form, FormStateInterface $form_state): void {
  // WARNING: with '#limit_validation_errors' => [] every value outside the
  // limited sections has been removed, so this is empty:
  //   $form_state->getValue('impact')  // NULL
  // Read the wizard's memory instead.
  $step = $form_state->get('step');
  $form_state->set('step', max(1, $step - 1));
  $form_state->setRebuild(TRUE);
}

// Save-draft variant: validate only the title, ignore the rest.
$form['actions']['draft'] = [
  '#type' => 'submit',
  '#value' => $this->t('Save draft'),
  '#limit_validation_errors' => [['title']],
  '#submit' => ['::saveDraft'],
];`,
      note: "#limit_validation_errors does two things: it skips validation outside the listed paths and it deletes those values from $form_state->getValues(). Never read submitted input in a limited-validation handler.",
    },
    {
      label: "Steps on separate routes: session vs PrivateTempStore",
      intro:
        "Once each step is its own URL with its own redirect, form storage is gone. Symfony reaches for the session; Drupal reaches for PrivateTempStore, which is per-user, namespaced and self-expiring.",
      php: `<?php
// Symfony: step 2 controller reads what step 1 put in the session.
public function stepTwo(Request $request): Response
{
    $session = $request->getSession();
    $data = $session->get('incident_wizard');
    if ($data === null) {
        return $this->redirectToRoute('incident_step_one');
    }

    $form = $this->createForm(ImpactType::class);
    $form->handleRequest($request);

    if ($form->isSubmitted() && $form->isValid()) {
        $session->set('incident_wizard', array_merge($data, $form->getData()));
        return $this->redirectToRoute('incident_step_three');
    }

    return $this->render('incident/step2.html.twig', ['form' => $form]);
}

// Lifetime is whatever framework.yaml gives the session
// (session.cookie_lifetime / gc_maxlifetime) — global, not per-feature.`,
      ts: `<?php
// Drupal: src/Form/IncidentStepTwoForm.php
namespace Drupal\\incident_tracker\\Form;

use Drupal\\Core\\Form\\EnforcedResponseException;
use Drupal\\Core\\Form\\FormBase;
use Drupal\\Core\\Form\\FormStateInterface;
use Drupal\\Core\\TempStore\\PrivateTempStoreFactory;
use Drupal\\Core\\Url;
use Symfony\\Component\\DependencyInjection\\ContainerInterface;
use Symfony\\Component\\HttpFoundation\\RedirectResponse;

class IncidentStepTwoForm extends FormBase {

  public function __construct(
    protected PrivateTempStoreFactory $tempStoreFactory,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static($container->get('tempstore.private'));
  }

  public function getFormId(): string {
    return 'incident_tracker_step_two';
  }

  public function buildForm(array $form, FormStateInterface $form_state): array {
    // One collection per module; keys are scoped to the current user
    // (or the anonymous session) automatically.
    $store = $this->tempStoreFactory->get('incident_tracker');
    $draft = $store->get('draft');
    if (!$draft) {
      // Nothing from step 1 — send them back to the start. NOT with
      // setRedirect(): FormBuilder only turns $form_state's redirect into a
      // response inside processForm()'s executed branch, after validation and
      // submit handlers. On this plain GET render nothing reads it, and the
      // user would just see an empty form. Throwing the response is what works
      // from buildForm(); EnforcedFormResponseSubscriber turns it into the
      // real 303. (Cleaner still: guard the route with a _custom_access
      // callback, or a controller that checks the draft before building.)
      throw new EnforcedResponseException(new RedirectResponse(
        Url::fromRoute('incident_tracker.wizard.step_one')->toString()
      ));
    }

    $form['impact'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Customer impact'),
      '#required' => TRUE,
      '#default_value' => $draft['impact'] ?? '',
    ];
    $form['actions'] = ['#type' => 'actions'];
    $form['actions']['back'] = [
      '#type' => 'submit',
      '#value' => $this->t('Back'),
      '#limit_validation_errors' => [],
      '#submit' => ['::backStep'],
    ];
    $form['actions']['submit'] = [
      '#type' => 'submit',
      '#value' => $this->t('Next'),
    ];
    return $form;
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $store = $this->tempStoreFactory->get('incident_tracker');
    $draft = $store->get('draft') ?? [];
    $draft['impact'] = $form_state->getValue('impact');
    $store->set('draft', $draft);
    // A real redirect — and the draft still survives it.
    $form_state->setRedirect('incident_tracker.wizard.step_three');
  }

  public function backStep(array &$form, FormStateInterface $form_state): void {
    $form_state->setRedirect('incident_tracker.wizard.step_one');
  }

  // The final step calls $store->delete('draft') after saving.
}`,
      note: "PrivateTempStore survives redirects, separate form classes and separate routes; form storage survives none of those. Remember to delete() the draft on completion or cancel. Note where each redirect lives: setRedirect() only becomes a RedirectResponse after submit handlers run, so it works in submitForm()/backStep() but is silently ignored in buildForm() — bail out of a build with EnforcedResponseException (or keep the guard in access/routing).",
    },
    {
      label: "How long does 'in progress' last?",
      intro:
        "Both platforms let a half-finished wizard expire, but the knobs are in different places — and the Drupal default that bites you is the form cache, not the tempstore.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: config/packages/framework.yaml
framework:
  session:
    handler_id: '%env(REDIS_URL)%'
    cookie_lifetime: 0        # dies with the browser session
    gc_maxlifetime: 86400     # 24h of idle time server-side

# One lifetime for everything in the session: cart, wizard, flash bag.
# Per-feature expiry means storing your own timestamp alongside the data.`,
      ts: `# Drupal: two independent lifetimes.

# 1. Form cache (engine 1 — setRebuild + form storage).
#    Six hours by DEFAULT, and tunable:
#    \\Drupal\\Core\\Form\\FormCache::setCache() uses
#    $expire = Settings::get('form_cache_expiration', 21600)
#    for the 'form' and 'form_state'
#    expirable key-value collections. Past that the form_build_id
#    posted by the browser resolves to nothing and the user sees
#    "The form has become outdated. Copy any unsaved work…"

# 2. PrivateTempStore (engine 2) — core.services.yml default:
parameters:
  tempstore.expire: 604800    # 1 week

# Override per site in sites/default/services.yml:
parameters:
  tempstore.expire: 172800    # 48 hours for the incident wizard

# Both stores live in key_value_expirable and are pruned on cron,
# so a stale row can linger until cron runs — never treat either as
# durable storage. Anything that must not be lost belongs in an
# entity or a custom table, even in draft state.`,
      note: "Six hours is short for a real-world wizard with attachments and approvals. If a step can be interrupted, use tempstore (or save a draft entity) rather than relying on the form cache.",
    },
  ],

  playground: {
    intro:
      "The wizard's state machine with no Drupal at all: storage accumulates, a failed validation rebuilds the same step, and 'Back' arrives with its values already stripped. Predict the six lines of POST output before running it.",
    lang: "php",
    code: `<?php
// A 3-step wizard the way FormBuilder sees it: values accumulate in
// $form_state storage, every step ends with setRebuild(TRUE), and "Back"
// carries '#limit_validation_errors' => [] so it skips validation entirely.

$steps = [
  1 => ['title' => 'Title', 'severity' => 'Severity'],
  2 => ['impact' => 'Impact'],
  3 => ['summary' => 'Summary'],
];

// $form_state: 'step' + 'data' live in storage, which is what gets cached
// under the hidden form_build_id between requests.
$form_state = ['step' => 1, 'storage' => [], 'redirect' => null];

function validate_step(array $required, array $values): array {
  $errors = [];
  foreach ($required as $name => $label) {
    if (trim((string) ($values[$name] ?? '')) === '') {
      $errors[$name] = $label . ' field is required.';
    }
  }
  return $errors;
}

function post(array &$form_state, array $steps, string $op, array $values): void {
  $step = $form_state['step'];
  echo "POST step {$step} [{$op}]\\n";

  if ($op === 'Back') {
    // '#limit_validation_errors' => [] validates nothing AND strips every
    // value from getValues() before the submit handler runs.
    $values = [];
    echo "  limit_validation_errors: [] -> nothing validated, values dropped\\n";
    $form_state['step'] = max(1, $step - 1);
    echo "  setRebuild(TRUE) -> buildForm() for step {$form_state['step']}\\n";
    return;
  }

  $errors = validate_step($steps[$step], $values);
  if ($errors !== []) {
    foreach ($errors as $name => $msg) {
      echo "  error[{$name}]: {$msg}\\n";
    }
    echo "  submit handlers skipped, step {$step} re-renders, storage untouched\\n";
    return;
  }

  // Accumulate this step's values into storage.
  $form_state['storage'] = array_merge($form_state['storage'], $values);

  if ($step < count($steps)) {
    $form_state['step'] = $step + 1;
    echo "  storage: " . implode(', ', array_keys($form_state['storage'])) . "\\n";
    echo "  setRebuild(TRUE) -> buildForm() for step {$form_state['step']}\\n";
    return;
  }

  // Last step: persist everything, no rebuild, redirect instead.
  echo "  saving incident: " . json_encode($form_state['storage']) . "\\n";
  $form_state['redirect'] = 'incident_tracker.list';
  echo "  no setRebuild -> redirect to {$form_state['redirect']}\\n";
}

post($form_state, $steps, 'Next', ['title' => 'DB outage', 'severity' => '']);
post($form_state, $steps, 'Next', ['title' => 'DB outage', 'severity' => 'critical']);
post($form_state, $steps, 'Back', ['impact' => '']);
post($form_state, $steps, 'Next', ['title' => 'DB outage (primary)', 'severity' => 'critical']);
post($form_state, $steps, 'Next', ['impact' => 'Checkout down for all users']);
post($form_state, $steps, 'Finish', ['summary' => 'Failover completed 09:41']);`,
    output: `POST step 1 [Next]
  error[severity]: Severity field is required.
  submit handlers skipped, step 1 re-renders, storage untouched
POST step 1 [Next]
  storage: title, severity
  setRebuild(TRUE) -> buildForm() for step 2
POST step 2 [Back]
  limit_validation_errors: [] -> nothing validated, values dropped
  setRebuild(TRUE) -> buildForm() for step 1
POST step 1 [Next]
  storage: title, severity
  setRebuild(TRUE) -> buildForm() for step 2
POST step 2 [Next]
  storage: title, severity, impact
  setRebuild(TRUE) -> buildForm() for step 3
POST step 3 [Finish]
  saving incident: {"title":"DB outage (primary)","severity":"critical","impact":"Checkout down for all users","summary":"Failover completed 09:41"}
  no setRebuild -> redirect to incident_tracker.list
`,
  },

  keyPoints: [
    "$form_state->setRebuild(TRUE) in a submit handler cancels the redirect and re-enters buildForm(), which is what makes a single form class behave like a wizard.",
    "Wizard memory lives in form storage — $form_state->set('step', N) and set('data', […]) — read back at the top of buildForm(); use cleanValues() before merging so form_build_id / form_token / op don't leak in.",
    "Form storage is cached in the 'form' and 'form_state' expirable key-value collections keyed by form_build_id, and FormCache::setCache() gives them Settings::get('form_cache_expiration', 21600) — six hours unless settings.php overrides it — so long wizards hit 'The form has become outdated'.",
    "Once steps are separate routes or a redirect happens between them, form storage is gone: inject tempstore.private, get('incident_tracker'), and set()/get()/delete() a draft array that is automatically scoped per user.",
    "PrivateTempStore defaults to a one-week lifetime via the tempstore.expire parameter, overridable in sites/default/services.yml; delete the key when the wizard completes or is cancelled.",
    "Back / Save-draft buttons need '#limit_validation_errors' (=> [] for none, [['title']] for a subset) plus their own '#submit'; values outside the limited paths are stripped from getValues(), so those handlers must read storage or tempstore instead.",
  ],

  interview: [
    {
      q: "How would you implement a three-step form in Drupal, and when would you not use $form_state storage?",
      a: "For steps that share one route, I use a single \`FormBase\` class: \`buildForm()\` reads \`$form_state->get('step')\` and returns the elements for that step only, and \`submitForm()\` merges \`cleanValues()->getValues()\` into a \`data\` array in storage, bumps the step, and calls \`$form_state->setRebuild(TRUE)\` so no redirect happens and \`buildForm()\` runs again. Only the final step skips \`setRebuild()\` and does the real save plus \`setRedirect()\`. I stop using form storage as soon as a step needs its own URL, its own form class, or a redirect in between — a batch job, a file upload, an approval hand-off — because the cached form state is keyed to the \`form_build_id\` of that one form. It is also the wrong choice for anything long-running: core's \`FormCache\` gives those entries six hours, and after that the user gets \"The form has become outdated\". In both of those cases I move the accumulated data to \`PrivateTempStore\`.",
    },
    {
      q: "What is PrivateTempStore, and how does it differ from cache, state and session?",
      a: "\`PrivateTempStore\` (service \`tempstore.private\`, a \`PrivateTempStoreFactory\` you call \`->get('my_module')\` on) is expirable per-user scratch storage in the \`key_value_expirable\` table, defaulting to one week via the \`tempstore.expire\` parameter. It differs from cache in the most important way: cache data can always be rebuilt from a source of truth, whereas tempstore data — a half-finished wizard, an unsaved layout change — cannot, so it must never be dropped just because a cache was cleared. It differs from \`State\` in that State is global and permanent-ish, while tempstore is per-owner and expires. And unlike raw session data it is namespaced by collection and key, expires on its own schedule, and comes with metadata about the owner and update time; \`SharedTempStore\` is the sibling used when several users need the same lock-style record, as node edit locking does.",
    },
    {
      q: "A Back button in a wizard fires validation errors for fields the user hasn't filled yet. How do you fix it, and what does the fix cost you?",
      a: "Put \`'#limit_validation_errors' => []\` on the Back button so nothing is validated, and give it its own \`'#submit' => ['::backStep']\` handler. Without the dedicated \`#submit\`, the form's normal submit handlers would still run — against a truncated value set — which is worse than the original bug. The cost is that limiting validation also strips every value outside the listed paths from \`$form_state->getValues()\`, so the Back handler cannot read what the user just typed; it has to decrement the step from storage (or tempstore) and call \`setRebuild(TRUE)\`. If you want to keep the current step's input when going back, validate that subset explicitly, e.g. \`'#limit_validation_errors' => [['impact']]\`, and merge it into storage yourself.",
    },
    {
      q: "A client reports that users who leave the wizard open over lunch lose everything. Diagnose it.",
      a: "That is the form cache expiring. A rebuilt form and its \`$form_state\` storage are written to the \`form\` and \`form_state\` expirable key-value collections under the hidden \`form_build_id\`, and \`FormCache::setCache()\` stamps them with \`Settings::get('form_cache_expiration', 21600)\` — six hours unless the site sets \`$settings['form_cache_expiration']\` in settings.php. When the POST comes back after that, the build id resolves to nothing, Drupal rejects the submission as an outdated form and the wizard restarts. Raising that setting is a legitimate stopgap, but it inflates the \`key_value_expire\` table and only moves the cliff, so the real fix is architectural: move the accumulated values into \`PrivateTempStore\` (whose default expiry is a week and is tunable via \`tempstore.expire\`), or save a real draft — an unpublished entity or a row in a custom table — after each step. I'd also make sure cron is running, since both stores are pruned on cron and stale rows otherwise accumulate.",
    },
  ],

  quiz: [
    {
      question:
        "In a single-class wizard, what does $form_state->setRebuild(TRUE) do when called from submitForm()?",
      options: [
        "Clears form storage and starts the wizard over at step 1",
        "Suppresses the redirect and re-runs buildForm(), so the next step renders from the same request",
        "Marks the form's render array cacheable so the next POST is faster",
        "Triggers an AJAX response containing only the changed elements",
      ],
      answerIndex: 1,
      explain:
        "setRebuild(TRUE) tells FormBuilder not to perform the post-submit redirect. It calls buildForm() again with the current $form_state — storage intact — and returns that markup, which is exactly how one class renders N steps on one route. Only the final step omits it, letting setRedirect() take effect.",
    },
    {
      question:
        "A Back button carries '#limit_validation_errors' => [] and '#submit' => ['::backStep']. Inside backStep(), what does $form_state->getValue('impact') return?",
      options: [
        "The textarea's submitted text, unvalidated",
        "The element's #default_value",
        "NULL — values outside the limited sections are stripped before submit handlers run",
        "It throws, because getValue() is unavailable in a limited-validation handler",
      ],
      answerIndex: 2,
      explain:
        "Limiting validation also limits which values survive: FormValidator removes everything outside the listed paths from $form_state->getValues() so submit handlers can't act on unvalidated input. With an empty array nothing survives, so a Back handler must read form storage (or tempstore) instead of submitted values.",
    },
    {
      question:
        "Which situation makes form storage ($form_state->set()) unusable and forces PrivateTempStore?",
      options: [
        "The wizard has more than three steps",
        "Step 2 needs a different validateForm() from step 1",
        "Each step is its own route and form class, so a redirect happens between steps",
        "The form uses #ajax to swap a fieldset",
      ],
      answerIndex: 2,
      explain:
        "Form storage rides on the cached form keyed by form_build_id, which belongs to one form on one route. A redirect to a different route and form class abandons it. AJAX rebuilds, extra steps and per-step validation all work fine with storage; a redirect between steps does not.",
    },
    {
      question:
        "How long does core keep a rebuilt form and its $form_state storage before the user sees 'The form has become outdated'?",
      options: [
        "As long as the PHP session lives",
        "Six hours — FormCache's default expiry is 21600 seconds",
        "One week, matching the tempstore.expire parameter",
        "Until the next cron run",
      ],
      answerIndex: 1,
      explain:
        "\\Drupal\\Core\\Form\\FormCache::setCache() writes the 'form' and 'form_state' expirable key-value entries with Settings::get('form_cache_expiration', 21600) — 21600 seconds (6 hours) by default, and overridable with $settings['form_cache_expiration'] in settings.php. PrivateTempStore's one-week default (tempstore.expire) is a separate mechanism, which is precisely why long or interruptible wizards should use tempstore instead.",
    },
  ],
};

export default lesson;
