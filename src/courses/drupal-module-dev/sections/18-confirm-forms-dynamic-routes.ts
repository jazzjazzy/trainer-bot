import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "confirm-forms-dynamic-routes",
  title: "Confirm Forms & Routes with Parameters",
  part: "Forms & Config",
  estMinutes: 12,
  summary:
    "Give incident_tracker a delete flow with ConfirmFormBase — route params flowing into buildForm(), entity upcasting, _csrf_token protection for state-changing links, and the ?destination round-trip.",

  concept: `
Deleting an incident is incident_tracker's first *destructive* action, and
destructive actions deserve friction: an interstitial page stating exactly what
is about to happen, an explicit confirm button, and a way out. In Symfony you
assemble that page yourself — a controller action, a Twig template with a
CSRF-protected form, a cancel link. Drupal ships the whole pattern as
\`ConfirmFormBase\`. This works identically in Drupal 10 and 11.

### Answer questions, inherit the page

\`IncidentDeleteForm extends ConfirmFormBase\` and mostly *answers questions*:
\`getQuestion()\` (rendered as the page title), \`getCancelUrl()\` (where Cancel
points), optionally \`getDescription()\` (defaults to "This action cannot be
undone.") and \`getConfirmText()\` (defaults to "Confirm"). The inherited
\`buildForm()\` assembles the confirm page from those answers, so the only real
logic you write is \`submitForm()\`: perform the delete, add a messenger status,
redirect.

### Route parameters become buildForm() arguments

The route is \`/incidents/{incident_id}/delete\` with a \`_form\` default. For
form routes, core runs the same argument resolver Symfony uses on controller
actions — against \`buildForm()\`. Placeholders arrive as extra arguments after
\`$form\` and \`$form_state\`, matched **by name**:

\`\`\`
public function buildForm(array $form, FormStateInterface $form_state, $incident_id = NULL)
\`\`\`

Name the parameter exactly like the placeholder (a classic gotcha: a mismatched
name silently resolves to the \`NULL\` default). Stash it on a property, then
call \`parent::buildForm()\` so \`getQuestion()\` can interpolate it.

### Upcasting: slugs become objects

If a placeholder name matches an entity type id — \`{node}\`, \`{user}\` —
**and** the receiving parameter type-hints the entity class or interface
(\`NodeInterface $node\`), core upcasts automatically and your argument is a
loaded entity, with a 404 fired before your code runs when the load fails. An
untyped parameter — like this lesson's \`$incident_id\` — gets the raw ID
string. For any other name, or an untyped parameter you want upcast, declare
the converter in the route's \`options.parameters.<name>.type\` (e.g.
\`entity:node\`). That is Symfony's \`#[MapEntity]\` / param-converter idea,
expressed in YAML.

### CSRF: forms are covered, links are not

Drupal's Form API embeds a per-session \`form_token\` in every form for
authenticated users, so the confirm form's POST is already CSRF-safe. Adding
\`_csrf_token\` to a \`_form\` route is therefore redundant — and actively
harmful: \`CsrfAccessCheck\` runs on the *GET* request and validates
\`?token=\` against the route path, so the confirm page 403s unless the URL was
generated through \`Url\`/\`Link\`. A bookmark, a typed path, a redirect, or a
link someone hand-wrote never carries the token, and the user is denied before
the form renders. The requirement exists for
*state-changing GET links*, like a one-click "Resolve" operation: put
\`_csrf_token: 'TRUE'\` under \`requirements:\`, and any URL built through
\`Url\`/\`Link\` gets \`?token=…\` appended automatically (injected late as a
placeholder, so render caching stays safe). A missing or wrong token is
rejected with 403 by the access system before your controller runs.

### destination: the return-path convention

Add \`'query' => $this->getDestinationArray()\` (from
\`RedirectDestinationTrait\`, already on \`FormBase\`/\`ControllerBase\`) when
generating the delete link, producing
\`/incidents/7/delete?destination=/incidents\`. The whole stack honors it: the
confirm form's cancel link prefers \`?destination\` over \`getCancelUrl()\`, and
after \`submitForm()\` the form submitter redirects to it, *overriding* whatever
\`$form_state->setRedirect()\` said. Core only accepts local paths for
destination, so the open-redirect check you would hand-write in Symfony is
built in.
`,

  comparisons: [
    {
      label: "The delete confirmation itself",
      intro:
        "Symfony makes you build the interstitial: an action that branches on method, a hand-written Twig confirm template, and your own CSRF token check. Drupal's ConfirmFormBase is the finished pattern — you answer getQuestion()/getCancelUrl() and write only the delete.",
      php: `<?php
// Symfony: assemble the pattern yourself — action + template + CSRF.
#[Route('/incidents/{id}/delete', name: 'incident_delete', methods: ['GET', 'POST'])]
public function delete(Incident $incident, Request $request, EntityManagerInterface $em): Response
{
    if ($request->isMethod('POST')) {
        if (!$this->isCsrfTokenValid('delete'.$incident->getId(), $request->request->get('_token'))) {
            throw $this->createAccessDeniedException('Invalid CSRF token.');
        }
        $em->remove($incident);
        $em->flush();
        $this->addFlash('success', 'Incident deleted.');
        return $this->redirectToRoute('incident_list');
    }

    // confirm_delete.html.twig — written by hand: the question, a
    // <form method="post"> with a hidden
    // {{ csrf_token('delete' ~ incident.id) }} field, and a cancel link.
    return $this->render('incident/confirm_delete.html.twig', [
        'incident' => $incident,
    ]);
}`,
      ts: `<?php
// Drupal: src/Form/IncidentDeleteForm.php — the pattern ships in core.
namespace Drupal\\incident_tracker\\Form;

use Drupal\\Core\\Form\\ConfirmFormBase;
use Drupal\\Core\\Form\\FormStateInterface;
use Drupal\\Core\\Url;

class IncidentDeleteForm extends ConfirmFormBase {

  protected int $incidentId;

  public function getFormId(): string {
    return 'incident_tracker_incident_delete';
  }

  public function getQuestion() {
    return $this->t('Are you sure you want to delete incident %id?', ['%id' => $this->incidentId]);
  }

  public function getCancelUrl(): Url {
    return Url::fromRoute('incident_tracker.list');
  }

  public function getDescription() {
    return $this->t('The incident and its log entries will be removed. This action cannot be undone.');
  }

  public function getConfirmText() {
    return $this->t('Delete incident');
  }

  public function buildForm(array $form, FormStateInterface $form_state, $incident_id = NULL): array {
    $this->incidentId = (int) $incident_id;
    // parent adds: question as #title, description, primary
    // "Delete incident" button, cancel link. No template to write.
    return parent::buildForm($form, $form_state);
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    // Repository injected via create(), as in the services sections.
    $this->repository->delete($this->incidentId);
    $this->messenger()->addStatus($this->t('Incident %id deleted.', ['%id' => $this->incidentId]));
    $form_state->setRedirectUrl($this->getCancelUrl());
  }
}`,
      note: "No CSRF code on the Drupal side: Form API embeds its own per-session form_token in the POST. getDescription()/getConfirmText() are optional overrides — omit them and you get 'This action cannot be undone.' and 'Confirm'.",
    },
    {
      label: "Route parameters reaching your code",
      intro:
        "Both frameworks resolve placeholders into arguments by parameter name. Symfony hands them to the controller action (with #[MapEntity] hydrating entities); Drupal hands them to buildForm() after $form and $form_state, with upcasting declared in YAML.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// Symfony 6.4/7: ArgumentResolver + #[MapEntity].
use Symfony\\Bridge\\Doctrine\\Attribute\\MapEntity;
use Symfony\\Component\\HttpFoundation\\Request;

#[Route('/incidents/{id}/delete', name: 'incident_delete')]
public function delete(
    #[MapEntity] Incident $incident,  // {id} -> hydrated entity
    Request $request,
): Response {
    // A missing Incident already threw a 404 before this runs.
    // Scalar params work too: delete(int $id) receives the raw '7'.
}`,
      ts: `# Drupal: incident_tracker.routing.yml
incident_tracker.incident_delete:
  path: '/incidents/{incident_id}/delete'
  defaults:
    _form: '\\Drupal\\incident_tracker\\Form\\IncidentDeleteForm'
    _title: 'Delete incident'
  requirements:
    _permission: 'administer incident tracker'

# The placeholder lands as a buildForm() argument, matched BY NAME:
#   buildForm(array $form, FormStateInterface $form_state,
#             $incident_id = NULL)
# A mismatched name silently yields the NULL default — classic bug.

# Upcasting: {node}/{user} auto-upcast only when the name matches
# the entity type id AND the parameter type-hints the entity class
# (NodeInterface $node) — untyped params get the raw ID.
# Any other placeholder needs the converter declared, and the
# key under options.parameters MUST be a path placeholder name
# or the block is inert. Generic shape, for a route whose path
# is '/incidents/{incident}/delete' backed by nodes:
#   options:
#     parameters:
#       incident:
#         type: 'entity:node'
# Then buildForm() receives the loaded node, and a failed load
# is a 404 before your code runs. incident_tracker's own route
# above keeps the raw {incident_id} — there is no entity to
# upcast to yet.`,
      note: "Same argument-resolver idea in both stacks. Drupal's options.parameters.<name>.type is the YAML spelling of Symfony's #[MapEntity]; because incident_tracker stores rows in a custom table (not entities yet), we pass the raw id and load it ourselves.",
    },
    {
      label: "CSRF-protecting a state-changing GET link",
      intro:
        "A one-click 'Resolve' link mutates state, so it needs a token. Symfony: mint csrf_token() in the template, verify in the action. Drupal: one requirements line — token generation and validation are automatic.",
      php: `<?php
// Symfony: mint the token in Twig, verify it in the action.
//
// list.html.twig:
//   <a href="{{ path('incident_resolve', {
//     id: incident.id,
//     _token: csrf_token('resolve' ~ incident.id),
//   }) }}">Resolve</a>

#[Route('/incidents/{id}/resolve', name: 'incident_resolve')]
public function resolve(Incident $incident, Request $request): Response
{
    if (!$this->isCsrfTokenValid('resolve'.$incident->getId(), $request->query->get('_token'))) {
        throw $this->createAccessDeniedException('Invalid CSRF token.');
    }
    $incident->setStatus('resolved');
    // ...flush, flash, redirect...
}`,
      ts: `<?php
// Drupal: declare it once on the route.
//
// incident_tracker.routing.yml:
//   incident_tracker.incident_resolve:
//     path: '/incidents/{incident_id}/resolve'
//     defaults:
//       _controller: '\\Drupal\\incident_tracker\\Controller\\IncidentController::resolve'
//     requirements:
//       _permission: 'edit incident reports'
//       _csrf_token: 'TRUE'

use Drupal\\Core\\Link;

// Build the link through the Url/Link APIs and ?token=... is
// appended automatically. The token is per-session and injected
// late as a placeholder, so render caching stays intact.
$build['operations'][] = Link::createFromRoute(
  $this->t('Resolve'),
  'incident_tracker.incident_resolve',
  ['incident_id' => $row->id],
)->toRenderable();

// Validation is automatic too: a wrong or missing token gets a
// 403 from the access system — your controller never runs.`,
      note: "Only for links/GET routes that mutate state. Don't put _csrf_token on a _form route: Form API already embeds its own form_token in every form, so it adds nothing — and it makes CsrfAccessCheck demand ?token= on the GET, so any path to the form that wasn't generated through Url/Link gets a 403 instead of the form.",
    },
    {
      label: "Round-tripping the return path",
      intro:
        "Users reach delete from different listings and should land back where they started. Symfony: thread a return-path param by hand and guard against open redirects. Drupal: ?destination is a core convention the whole stack honors.",
      php: `<?php
// Symfony: hand-rolled returnTo param.
//
// list.html.twig:
//   <a href="{{ path('incident_delete', {
//     id: incident.id,
//     returnTo: app.request.requestUri,
//   }) }}">Delete</a>

public function delete(Incident $incident, Request $request): Response
{
    // ...confirm branch, CSRF check, remove/flush...

    $returnTo = $request->query->get('returnTo');
    // Validate it yourself or ship an open-redirect vulnerability.
    if ($returnTo && str_starts_with($returnTo, '/') && !str_starts_with($returnTo, '//')) {
        return $this->redirect($returnTo);
    }
    return $this->redirectToRoute('incident_list');
}`,
      ts: `<?php
// Drupal: ?destination is honored by the whole stack.

// 1. The listing controller adds it to the delete link.
//    getDestinationArray() comes from RedirectDestinationTrait
//    (already on ControllerBase/FormBase).
$build['ops'][] = Link::createFromRoute(
  $this->t('Delete'),
  'incident_tracker.incident_delete',
  ['incident_id' => $row->id],
  ['query' => $this->getDestinationArray()],
)->toRenderable();
// -> /incidents/7/delete?destination=/incidents

// 2. The confirm form's Cancel link automatically prefers
//    ?destination over getCancelUrl() (ConfirmFormHelper).

// 3. After submitForm(), the form submitter sees ?destination
//    and redirects there — OVERRIDING $form_state->setRedirect().

// 4. Core rejects non-local destination values, so the
//    open-redirect guard is built in.`,
      note: "Because ?destination overrides setRedirect(), a delete link with a destination returns the user to the exact listing page they came from — your submitForm() redirect is just the fallback.",
    },
  ],

  playground: {
    intro:
      "The whole section in ~80 lines: a route pattern yields named params, the param converter upcasts the slug into a record, buildForm() receives it as a trailing argument, and ?destination beats the form's own redirect. Predict all three requests — including the failed upcast.",
    lang: "php",
    code: `<?php
// Confirm-form plumbing in miniature: route placeholders flow into
// buildForm() as trailing arguments, get upcast into loaded records,
// and the ?destination query param beats the form's own redirect.

$db = [
  7 => ['id' => 7, 'title' => 'DB outage'],
  9 => ['id' => 9, 'title' => 'Cache stampede'],
];

// Route: path: '/incidents/{incident_id}/delete', defaults: _form: IncidentDeleteForm.
const PATTERN = '/incidents/{incident_id}/delete';

function match_params(string $pattern, string $path): ?array {
  $regex = '#^' . preg_replace('/\\{(\\w+)\\}/', '(?P<$1>[^/]+)', $pattern) . '$#';
  return preg_match($regex, $path, $m)
    ? array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY)
    : null;
}

class IncidentDeleteForm {
  private array $incident;

  public function getQuestion(): string {
    return "Are you sure you want to delete incident \\"{$this->incident['title']}\\"?";
  }

  public function getCancelUrl(): string {
    return '/incidents'; // route: incident_tracker.list
  }

  // Route params arrive as extra arguments after $form and $form_state.
  public function buildForm(array $form, array &$form_state, ?array $incident = null): array {
    $this->incident = $incident;
    // Everything below is what parent::buildForm() adds for you:
    $form['#title'] = $this->getQuestion();
    $form['description'] = 'This action cannot be undone.';
    $form['confirm'] = '[ Delete incident ]';
    // ConfirmFormHelper: the cancel link honors ?destination first.
    $cancel = $form_state['query']['destination'] ?? $this->getCancelUrl();
    $form['cancel'] = "[ Cancel -> {$cancel} ]";
    return $form;
  }

  public function submitForm(array &$form_state, array &$db): void {
    unset($db[$this->incident['id']]);
    echo "messenger: Incident \\"{$this->incident['title']}\\" deleted.\\n";
    // FormSubmitter: ?destination overrides setRedirect().
    $form_state['redirect'] = $form_state['query']['destination'] ?? $this->getCancelUrl();
  }
}

function handle(string $path, array $query, array &$db): void {
  echo "GET {$path}" . ($query ? '?' . http_build_query($query) : '') . "\\n";
  $raw = match_params(PATTERN, $path);

  // Upcasting: the param converter swaps the raw slug for a loaded record
  // (options.parameters.incident_id.type in the routing YAML).
  $incident = $db[(int) $raw['incident_id']] ?? null;
  if ($incident === null) {
    echo "=> 404 Not Found (upcast failed: no incident {$raw['incident_id']})\\n\\n";
    return;
  }
  echo 'route params: ' . json_encode($raw) . " -> upcast to \\"{$incident['title']}\\"\\n";

  $form_state = ['query' => $query, 'redirect' => null];
  $delete_form = new IncidentDeleteForm();
  $build = $delete_form->buildForm([], $form_state, $incident);
  echo "confirm page: {$build['#title']}\\n";
  echo "  {$build['description']}\\n";
  echo "  {$build['confirm']}  {$build['cancel']}\\n";

  echo "POST (user clicks Delete incident)\\n";
  $delete_form->submitForm($form_state, $db);
  echo "=> redirect: {$form_state['redirect']}\\n\\n";
}

handle('/incidents/7/delete', [], $db);
handle('/incidents/9/delete', ['destination' => '/dashboard'], $db);
handle('/incidents/42/delete', [], $db);

echo 'incidents left: ' . json_encode(array_column($db, 'title')) . "\\n";`,
    output: `GET /incidents/7/delete
route params: {"incident_id":"7"} -> upcast to "DB outage"
confirm page: Are you sure you want to delete incident "DB outage"?
  This action cannot be undone.
  [ Delete incident ]  [ Cancel -> /incidents ]
POST (user clicks Delete incident)
messenger: Incident "DB outage" deleted.
=> redirect: /incidents

GET /incidents/9/delete?destination=%2Fdashboard
route params: {"incident_id":"9"} -> upcast to "Cache stampede"
confirm page: Are you sure you want to delete incident "Cache stampede"?
  This action cannot be undone.
  [ Delete incident ]  [ Cancel -> /dashboard ]
POST (user clicks Delete incident)
messenger: Incident "Cache stampede" deleted.
=> redirect: /dashboard

GET /incidents/42/delete
=> 404 Not Found (upcast failed: no incident 42)

incidents left: []
`,
  },

  keyPoints: [
    "ConfirmFormBase is the shipped destructive-action pattern: implement getFormId(), getQuestion(), getCancelUrl(), submitForm(); getDescription()/getConfirmText() are optional overrides and parent::buildForm() renders the whole page.",
    "Route placeholders like {incident_id} arrive as extra buildForm() arguments after $form and $form_state, resolved BY NAME — a mismatched parameter name silently yields the NULL default.",
    "Upcasting turns slugs into loaded objects: automatic when the placeholder name matches an entity type id ({node}, {user}) AND the buildForm()/controller parameter type-hints the entity class or interface (NodeInterface $node) — an untyped parameter gets the raw ID; otherwise declared via options.parameters.<name>.type (e.g. 'entity:node'), with a built-in 404 on failed load.",
    "Forms are already CSRF-safe (Form API's per-session form_token); requirements._csrf_token: 'TRUE' is for state-changing GET links, where Url/Link generation appends ?token=... automatically and the access system answers 403 on mismatch.",
    "Don't combine _csrf_token with a _form route: the form token already covers the POST, so it is redundant, and CsrfAccessCheck then requires ?token= on the GET request — any URL not generated through Url/Link (bookmark, typed path, redirect) 403s before the form renders.",
    "?destination round-trips the return path: add it with $this->getDestinationArray() on the link; the confirm form's cancel link prefers it, and after submit it overrides $form_state->setRedirect(), with core rejecting non-local values.",
  ],

  interview: [
    {
      q: "You need a delete-with-confirmation flow in Drupal. What does core give you that you'd hand-build in Symfony?",
      a: "In Symfony I'd write a controller action that branches on request method, a Twig confirmation template, a hidden \`csrf_token()\` field, and the token check — all by hand. Drupal packages that as \`ConfirmFormBase\`: I extend it, return the question from \`getQuestion()\` and the escape hatch from \`getCancelUrl()\`, and the inherited \`buildForm()\` renders the interstitial with a primary confirm button and cancel link. The only real logic I write is \`submitForm()\` — perform the delete, \`messenger()->addStatus()\`, redirect. CSRF is free too, because Form API embeds a per-session form token in every form's POST.",
    },
    {
      q: "How does a route parameter like {incident_id} reach a form class, and what's the classic mistake?",
      a: "For \`_form\` routes, core runs the argument resolver — the same mechanism Symfony uses on controller actions — against \`buildForm()\`, so placeholders arrive as trailing arguments after \`array $form, FormStateInterface $form_state\`, matched by parameter name: \`buildForm(array $form, FormStateInterface $form_state, $incident_id = NULL)\`. The classic mistake is naming the PHP parameter differently from the placeholder; resolution is by name, so the argument silently falls back to its \`NULL\` default and the form appears to load with no data. Convention is to stash the value on a property and then call \`parent::buildForm()\` so \`getQuestion()\` can use it.",
    },
    {
      q: "Explain Drupal's upcasting compared to Symfony's #[MapEntity], and when you must configure it explicitly.",
      a: "Both convert a raw URL slug into a loaded object before your code runs, returning 404 if the load fails. In Symfony 6.4/7 that's \`#[MapEntity]\` (the param-converter idea) on the action argument. In Drupal, upcasting is automatic when the placeholder name equals an entity type id *and* the controller or \`buildForm()\` parameter type-hints the entity class or interface — \`NodeInterface $node\` gives you a loaded Node, while an untyped \`$node\` still receives the raw ID — and for any other placeholder name (or an untyped parameter) you declare it in the route YAML under \`options.parameters.<name>.type\`, e.g. \`type: 'entity:node'\`. If you skip the declaration you simply receive the raw string, which is fine when, like incident_tracker's custom table, there's no entity to upcast to and you load the record yourself.",
    },
    {
      q: "When do you need _csrf_token on a Drupal route, and why doesn't the confirm form need it?",
      a: "\`_csrf_token: 'TRUE'\` protects state-changing *links* — GET routes like a one-click 'Resolve' operation that mutate data. Declare it under \`requirements:\` and any URL generated through \`Url\`/\`Link\` gets a per-session \`?token=\` appended automatically (as a late placeholder, so render caching survives), and the access system returns 403 on a bad token before the controller runs — versus Symfony where I mint \`csrf_token()\` in Twig and call \`isCsrfTokenValid()\` myself. Forms never need it: Form API already embeds its own \`form_token\` in every form for authenticated users, so on a \`_form\` route \`_csrf_token\` is redundant — and it backfires, because \`CsrfAccessCheck\` then requires \`?token=\` on the GET request, so anyone reaching the form by a bookmark, a typed path, or a redirect gets a 403 instead of the confirm page; only links generated through \`Url\`/\`Link\` still work. The rule of thumb: mutations belong in POSTs (forms), and the rare mutating GET link gets the route requirement.",
    },
  ],

  quiz: [
    {
      question: "Which methods MUST IncidentDeleteForm implement when extending ConfirmFormBase?",
      options: [
        "getFormId(), getQuestion(), getCancelUrl(), submitForm()",
        "getQuestion(), getDescription(), getConfirmText(), getCancelText()",
        "buildForm(), validateForm(), submitForm() — same as FormBase",
        "Only submitForm(); everything else has a default",
      ],
      answerIndex: 0,
      explain:
        "getQuestion() and getCancelUrl() are the abstract methods ConfirmFormBase adds, on top of getFormId() and submitForm() required by every form. getDescription() ('This action cannot be undone.'), getConfirmText() ('Confirm'), and getCancelText() ('Cancel') all have defaults you may override. Overriding buildForm() is only needed to capture route parameters — and it must call parent::buildForm().",
    },
    {
      question: "The route defines path '/incidents/{incident_id}/delete' but you write buildForm(array $form, FormStateInterface $form_state, $id = NULL). What happens?",
      options: [
        "Drupal throws an exception listing the unresolvable parameter",
        "$id receives the value positionally, since it's the third argument",
        "$id is silently NULL — route params are matched to buildForm() arguments by name",
        "It works, but only if you add options.parameters.id to the route",
      ],
      answerIndex: 2,
      explain:
        "Form routes run the argument resolver against buildForm(), matching placeholders to parameters BY NAME, exactly like Symfony action arguments. '$id' matches no placeholder, so it quietly falls back to its NULL default — the form renders but has no idea which incident it's deleting. Renaming the parameter to $incident_id fixes it.",
    },
    {
      question: "Why should you NOT add _csrf_token: 'TRUE' to the delete confirmation form's route?",
      options: [
        "Because the route already has _permission, and requirements are mutually exclusive",
        "Because Form API already embeds its own form token in the POST; _csrf_token is for state-changing GET links and is redundant (and 403-prone) on _form routes",
        "Because CSRF tokens disable render caching site-wide",
        "You should — every mutating route needs _csrf_token",
      ],
      answerIndex: 1,
      explain:
        "Forms are CSRF-protected out of the box via the per-session form_token that FormBuilder embeds and validates, so _csrf_token adds nothing to the POST. It exists for the other case: GET links that mutate state (like a one-click resolve operation), where Url/Link generation appends ?token=... automatically and the access system rejects mismatches with 403. Put it on a _form route and that same CsrfAccessCheck now guards the GET that renders the form: reach the page by a bookmark, a typed path, or a redirect — anything not generated through Url/Link — and you get a 403 instead of the confirm page.",
    },
    {
      question: "A delete link carries ?destination=/dashboard. In submitForm() you call $form_state->setRedirect('incident_tracker.list'). Where does the user land after confirming?",
      options: [
        "/incidents — the list route always wins because it's set last",
        "/dashboard — the destination query param overrides the form's redirect",
        "An error: setRedirect() and destination cannot coexist",
        "/dashboard only if it's also set as getCancelUrl()",
      ],
      answerIndex: 1,
      explain:
        "The ?destination convention is honored across the stack: the confirm form's cancel link prefers it over getCancelUrl(), and after submit handlers run, the form submitter redirects to the destination, overriding $form_state->setRedirect(). Your redirect is the fallback for when no destination is present. Core rejects non-local destination values, so it can't become an open redirect.",
    },
  ],
};

export default lesson;
