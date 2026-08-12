import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "ajax-forms-advanced",
  title: "AJAX Deep: Commands, Dialogs & Off-Canvas",
  part: "Form API in Depth",
  estMinutes: 13,
  summary:
    "Stop returning form fragments and start returning an AjaxResponse: a queue of commands that replace, remove, invoke, message, redirect and open modal or off-canvas dialogs — plus how to add a command of your own.",

  concept: `
Returning \`\$form['severity']\` from an #ajax callback is the training-wheels
version: \`FormAjaxResponseBuilder\` hands the render array to
\`AjaxRenderer::renderResponse()\`, which renders it and adds an
\`InsertCommand(NULL, \$html)\` — the \`NULL\` selector is resolved client-side
to \`#ajax['wrapper']\` and the insert method comes from \`#ajax['method']\`
(default \`replaceWith\`) — plus a \`PrependCommand\` of status messages when
there are any. The real API is one level down. Return a
\`Drupal\\Core\\Ajax\\AjaxResponse\` and push commands onto it; each command is
a PHP object whose \`render()\` returns a plain array with a \`command\` key.
Core serializes the list to JSON, and \`Drupal.AjaxCommands\` in \`misc/ajax.js\`
executes them **in order**. This is the same architecture as Symfony UX Turbo
Streams — HTML plus an action verb over the wire — except Drupal ships a fixed
vocabulary of roughly forty verbs instead of Turbo's seven.

### The vocabulary worth memorising

- **DOM**: \`ReplaceCommand\` (jQuery \`replaceWith\` — the element itself goes),
  \`HtmlCommand\` (inner HTML only, element survives), \`AppendCommand\`,
  \`PrependCommand\`, \`BeforeCommand\`, \`AfterCommand\`, \`RemoveCommand\`.
  All the insert-flavoured ones are the same \`InsertCommand\` with a different
  \`method\`.
- **Behaviour**: \`InvokeCommand(selector, method, args)\` calls any jQuery
  method; \`CssCommand\`; \`SettingsCommand\` merges into \`drupalSettings\`;
  \`AddCssCommand\` / \`AddJsCommand\`.
- **UX**: \`MessageCommand(message, wrapper = NULL, options, clearPrevious)\` —
  \`NULL\` targets the page's \`[data-drupal-messages]\` region;
  \`RedirectCommand(url)\` for a real page change; \`AnnounceCommand\` for
  screen readers; \`FocusFirstCommand\` (in core since 9.2); and
  \`ScrollTopCommand\`, which moved from Views into \`Drupal\\Core\\Ajax\` in
  10.1 — the old \`Drupal\\views\\Ajax\\ScrollTopCommand\` is deprecated in 10.1
  and removed in 11.
- **Dialogs**: \`OpenModalDialogCommand(title, content, options)\`,
  \`OpenOffCanvasDialogCommand(...)\` (fifth arg \`\$position\`, \`'side'\` or
  \`'top'\`), \`OpenDialogCommand(selector, ...)\` for a non-modal, and
  \`CloseModalDialogCommand\` / \`CloseDialogCommand\` to dismiss.

The content argument of a dialog command may be a render array — pass
\`\$this->formBuilder()->getForm(IncidentTriageForm::class)\` and you get a form
in a modal, submit button and all.

### Full #ajax key list

\`callback\` (method, \`'::method'\`, or a callable), \`wrapper\` (target HTML id),
\`event\` (buttons default to \`mousedown\` plus \`keypress\`; select/checkbox/radio
to \`change\`; textfields to \`blur\`), \`method\` (jQuery insert method, default
\`replaceWith\` — the \`'replace'\` alias was deprecated in 10.3 and removed in
11), \`effect\` (\`none\`/\`fade\`/\`slide\`) with \`speed\`, \`progress\`
(\`['type' => 'throbber'|'bar'|'fullscreen'|'none', 'message' => ...]\`),
\`disable-refocus\` (stops core stealing focus back to the trigger),
\`prevent\`, plus \`url\` and \`options\` if you want the request to hit a route
of your own rather than the form.

### Your own command

Two halves, no magic:

\`\`\`php
// incident_tracker/src/Ajax/HighlightCommand.php
final class HighlightCommand implements CommandInterface {
  public function __construct(private string \$selector, private string \$level) {}
  public function render(): array {
    return ['command' => 'incidentHighlight', 'selector' => \$this->selector, 'level' => \$this->level];
  }
}
\`\`\`

Then \`Drupal.AjaxCommands.prototype.incidentHighlight = function (ajax, response, status)\`
in a JS file, declared in \`incident_tracker.libraries.yml\` with a
\`core/drupal.ajax\` dependency, and attached via
\`\$response->addAttachments(['library' => ['incident_tracker/highlight']])\`.
Command names are a global namespace — prefix them with your module.
`,

  comparisons: [
    {
      label: "Many DOM updates from one submit",
      intro:
        "After saving an incident we want to append a row, drop the empty-state, flash a message and mark the form clean — all from one request.",
      leftLang: "twig",
      rightLang: "php",
      php: `{# templates/incident/new.html.twig — Symfony UX Turbo #}
{% block success_stream %}
  <turbo-stream action="append" target="incident-list">
    <template>{{ block('incident_row') }}</template>
  </turbo-stream>
  <turbo-stream action="remove" target="empty-message"></turbo-stream>
  <turbo-stream action="update" target="flash">
    <template><div class="flash">Incident {{ incident.ref }} filed.</div></template>
  </turbo-stream>
{% endblock %}

{# Controller:
   if (TurboBundle::STREAM_FORMAT === $request->getPreferredFormat()) {
     $request->setRequestFormat(TurboBundle::STREAM_FORMAT);
     return $this->renderBlock('incident/new.html.twig', 'success_stream', [...]);
   } #}`,
      ts: `// incident_tracker/src/Form/IncidentReportForm.php
public function ajaxSubmit(array &$form, FormStateInterface $form_state): AjaxResponse {
  $response = new AjaxResponse();

  if ($form_state->hasAnyErrors()) {
    // Errors: send the rebuilt form back so validation markup shows.
    return $response->addCommand(new ReplaceCommand('#incident-form-wrapper', $form));
  }

  $row = ['#theme' => 'incident_row', '#incident' => $this->saved];

  $response->addCommand(new AppendCommand('#incident-list', $row));
  $response->addCommand(new RemoveCommand('#empty-message'));
  $response->addCommand(new MessageCommand(
    $this->t('Incident @label filed.', ['@label' => $this->saved->label()]),
    NULL,
    ['type' => 'status'],
  ));
  $response->addCommand(new InvokeCommand('#incident-form', 'addClass', ['is-saved']));

  return $response;
}`,
      note: "Turbo actions live in a Twig template; Drupal commands are PHP objects added to a queue. AppendCommand takes a render array, so #theme output and its cache metadata and #attached libraries still flow through the normal render pipeline.",
    },
    {
      label: "Opening a form in a modal from a link",
      intro:
        "A 'Triage' link on each incident row should open the triage form in a modal instead of navigating away.",
      leftLang: "twig",
      rightLang: "php",
      php: `{# Symfony: you wire the modal yourself. #}
<a href="{{ path('incident_triage', {id: incident.id}) }}"
   data-controller="modal"
   data-action="modal#open">Triage</a>

{# assets/controllers/modal_controller.js (Stimulus) #}
{#
  async open(event) {
    event.preventDefault();
    const html = await (await fetch(event.currentTarget.href)).text();
    this.dialogTarget.innerHTML = html;
    this.dialogTarget.showModal();
  }
#}`,
      ts: `use Drupal\\node\\NodeInterface;

// The link — a render array, no JS of your own.
$build['triage'] = [
  '#type' => 'link',
  '#title' => $this->t('Triage'),
  '#url' => Url::fromRoute('incident_tracker.triage', ['incident' => $id]),
  '#attributes' => [
    'class' => ['use-ajax', 'button'],
    'data-dialog-type' => 'modal',
    'data-dialog-options' => Json::encode(['width' => 640, 'title' => 'Triage']),
  ],
  '#attached' => ['library' => ['core/drupal.dialog.ajax']],
];

// Off-canvas instead? Same link, two extra attributes:
//   'data-dialog-type' => 'dialog',
//   'data-dialog-renderer' => 'off_canvas',

// Route _controller returning the form as a modal explicitly:
// ({incident} is the node of bundle 'incident' upcast by the route.)
public function triage(NodeInterface $incident): AjaxResponse {
  $form = $this->formBuilder()->getForm(IncidentTriageForm::class, $incident);
  return (new AjaxResponse())->addCommand(
    new OpenModalDialogCommand($this->t('Triage @label', ['@label' => $incident->label()]), $form, ['width' => 640]),
  );
}`,
      note: "With use-ajax + data-dialog-type, core sets _wrapper_format=drupal_modal and the DialogRenderer wraps whatever the route returns — your controller can stay a plain render-array controller. Return an AjaxResponse yourself only when you need extra commands alongside the dialog.",
    },
    {
      label: "The #ajax array, all keys",
      intro:
        "Symfony gives you a Stimulus controller and a fetch; Drupal gives you a declarative array core turns into the same behaviour.",
      leftLang: "js",
      rightLang: "php",
      php: `// assets/controllers/severity_controller.js
export default class extends Controller {
  static targets = ['wrapper'];

  async refresh(event) {
    this.wrapperTarget.classList.add('is-loading');   // progress
    const body = new FormData(this.element.closest('form'));
    const res = await fetch(this.urlValue, { method: 'POST', body });
    this.wrapperTarget.outerHTML = await res.text();  // method: replaceWith
    this.wrapperTarget.classList.remove('is-loading');
    // refocus, effects, keyboard equivalence: all yours to write
  }
}`,
      ts: `$form['category'] = [
  '#type' => 'select',
  '#title' => $this->t('Category'),
  '#options' => $this->categoryOptions(),
  '#ajax' => [
    'callback' => '::updateSeverity',   // or [$this, 'updateSeverity'], or a function name
    'wrapper' => 'severity-wrapper',    // HTML id, no '#'
    'event' => 'change',                // buttons default to mousedown + keypress
    'method' => 'replaceWith',          // 'replace' removed in Drupal 11
    'effect' => 'fade',
    'speed' => 300,
    'progress' => ['type' => 'throbber', 'message' => $this->t('Loading severities…')],
    'disable-refocus' => TRUE,          // don't yank focus back to the select
    'prevent' => 'click',               // events to suppress alongside the ajax one
  ],
];

$form['severity'] = [
  '#type' => 'select',
  '#title' => $this->t('Severity'),
  '#options' => $this->severityOptions($form_state->getValue('category')),
  '#prefix' => '<div id="severity-wrapper">',
  '#suffix' => '</div>',
];`,
      note: "wrapper is an HTML id without the '#', but every command selector (ReplaceCommand, InvokeCommand…) is a full CSS selector and needs it. Mixing the two up is the single most common AJAX bug.",
    },
    {
      label: "Teaching the client a new verb",
      intro:
        "Both frameworks let you register a custom action name; the difference is only where the name is declared.",
      leftLang: "js",
      rightLang: "js",
      php: `// assets/turbo_actions.js — Symfony UX Turbo
import * as Turbo from '@hotwired/turbo';

Turbo.StreamActions.highlight = function () {
  const level = this.getAttribute('level');
  this.targetElements.forEach((el) => {
    el.classList.add('incident--' + level);
    el.addEventListener('animationend', () => el.classList.remove('incident--' + level), { once: true });
  });
};

// Server emits: <turbo-stream action="highlight" target="incident-18" level="critical">`,
      ts: `// incident_tracker/js/highlight.js
(function (Drupal, once) {
  Drupal.AjaxCommands.prototype.incidentHighlight = function (ajax, response, status) {
    document.querySelectorAll(response.selector).forEach((el) => {
      el.classList.add('incident--' + response.level);
      el.addEventListener('animationend', () => el.classList.remove('incident--' + response.level), { once: true });
    });
  };
})(Drupal, once);

// incident_tracker.libraries.yml
// highlight:
//   js:
//     js/highlight.js: {}
//   dependencies:
//     - core/drupal.ajax
//     - core/once

// Server emits: $response->addCommand(new HighlightCommand('#incident-18', 'critical'));
//               $response->addAttachments(['library' => ['incident_tracker/highlight']]);`,
      note: "response is exactly the array your PHP render() returned, so keep the keys stable — they are your wire contract. Drupal.AjaxCommands.prototype is global, so prefix command names with the module to avoid collisions with core's ~40.",
    },
  ],

  playground: {
    intro:
      "A stripped-down AjaxResponse and a fake Drupal.AjaxCommands. Predict the DOM after the queue runs — note where the prepended HtmlCommand lands.",
    lang: "php",
    code: `<?php
// A miniature AjaxResponse. PHP never touches the DOM: every command is just
// an array with a 'command' key, and the browser's Drupal.AjaxCommands runs
// them in the order they were added.

interface CommandInterface {
  public function render(): array;
}

final class HtmlCommand implements CommandInterface {
  public function __construct(private string $selector, private string $html) {}
  public function render(): array {
    return ['command' => 'insert', 'method' => 'html', 'selector' => $this->selector, 'data' => $this->html];
  }
}

final class AppendCommand implements CommandInterface {
  public function __construct(private string $selector, private string $html) {}
  public function render(): array {
    return ['command' => 'insert', 'method' => 'append', 'selector' => $this->selector, 'data' => $this->html];
  }
}

final class RemoveCommand implements CommandInterface {
  public function __construct(private string $selector) {}
  public function render(): array {
    return ['command' => 'remove', 'selector' => $this->selector];
  }
}

final class InvokeCommand implements CommandInterface {
  public function __construct(private string $selector, private string $method, private array $args = []) {}
  public function render(): array {
    return ['command' => 'invoke', 'selector' => $this->selector, 'method' => $this->method, 'arguments' => $this->args];
  }
}

final class OpenModalDialogCommand implements CommandInterface {
  public function __construct(private string $title, private string $html, private array $options = []) {}
  public function render(): array {
    return ['command' => 'openDialog', 'selector' => '#drupal-modal', 'title' => $this->title,
            'data' => $this->html, 'dialogOptions' => $this->options + ['modal' => TRUE]];
  }
}

final class AjaxResponse {
  private array $commands = [];
  public function addCommand(CommandInterface $c, bool $prepend = FALSE): static {
    if ($prepend) { array_unshift($this->commands, $c->render()); }
    else { $this->commands[] = $c->render(); }
    return $this;
  }
  public function getCommands(): array { return $this->commands; }
}

// --- The "browser": a fake DOM plus Drupal.AjaxCommands. ---------------------
$dom = [
  '#incident-list'   => '<li>INC-17</li>',
  '#empty-message'   => '<p>Nothing open.</p>',
  '#incident-form'   => '<form>...</form>',
];
$classes = [];

function apply(array &$dom, array &$classes, array $cmd): string {
  switch ($cmd['command']) {
    case 'insert':
      $sel = $cmd['selector'];
      $dom[$sel] = $cmd['method'] === 'append' ? ($dom[$sel] ?? '') . $cmd['data'] : $cmd['data'];
      return sprintf('insert(%s) on %s', $cmd['method'], $sel);
    case 'remove':
      unset($dom[$cmd['selector']]);
      return sprintf('remove %s', $cmd['selector']);
    case 'invoke':
      $classes[$cmd['selector']][] = $cmd['arguments'][0];
      return sprintf('invoke %s.%s(%s)', $cmd['selector'], $cmd['method'], implode(',', $cmd['arguments']));
    case 'openDialog':
      $dom[$cmd['selector']] = $cmd['data'];
      return sprintf('openDialog "%s" modal=%s', $cmd['title'], var_export($cmd['dialogOptions']['modal'], TRUE));
  }
  return 'unknown';
}

// --- What the #ajax callback builds. ----------------------------------------
$response = (new AjaxResponse())
  ->addCommand(new AppendCommand('#incident-list', '<li>INC-18</li>'))
  ->addCommand(new RemoveCommand('#empty-message'))
  ->addCommand(new InvokeCommand('#incident-form', 'addClass', ['is-saved']))
  ->addCommand(new OpenModalDialogCommand('Incident saved', '<p>INC-18 filed.</p>', ['width' => 480]))
  ->addCommand(new HtmlCommand('#incident-count', '2'), TRUE);

echo "Serialized to the browser:\\n";
foreach ($response->getCommands() as $i => $cmd) {
  printf("  %d. %s\\n", $i, $cmd['command']);
}

echo "\\nExecuted in order:\\n";
foreach ($response->getCommands() as $cmd) {
  echo '  - ' . apply($dom, $classes, $cmd) . "\\n";
}

echo "\\nResulting DOM:\\n";
print_r($dom);
echo "Classes added: ";
print_r($classes);
`,
    output: `Serialized to the browser:
  0. insert
  1. insert
  2. remove
  3. invoke
  4. openDialog

Executed in order:
  - insert(html) on #incident-count
  - insert(append) on #incident-list
  - remove #empty-message
  - invoke #incident-form.addClass(is-saved)
  - openDialog "Incident saved" modal=true

Resulting DOM:
Array
(
    [#incident-list] => <li>INC-17</li><li>INC-18</li>
    [#incident-form] => <form>...</form>
    [#incident-count] => 2
    [#drupal-modal] => <p>INC-18 filed.</p>
)
Classes added: Array
(
    [#incident-form] => Array
        (
            [0] => is-saved
        )

)
`,
  },

  keyPoints: [
    "Returning a render array from an #ajax callback is sugar for an InsertCommand with a NULL selector, which ajax.js resolves to #ajax['wrapper'] using #ajax['method'] (default replaceWith); returning an AjaxResponse lets you push an ordered queue of commands at many selectors instead.",
    "Commands are PHP objects whose render() emits an array with a 'command' key; Drupal.AjaxCommands in misc/ajax.js dispatches on that key — the same HTML-over-the-wire idea as Turbo Streams, with a fixed core vocabulary.",
    "ReplaceCommand swaps the element itself (replaceWith) while HtmlCommand only swaps its contents — get this wrong and your wrapper id disappears, breaking every subsequent AJAX round trip.",
    "A link with class 'use-ajax' plus data-dialog-type='modal' (or data-dialog-type='dialog' + data-dialog-renderer='off_canvas') and core/drupal.dialog.ajax opens any route in a dialog with no JS of your own; dialog command content may be a render array, including a full form.",
    "#ajax keys worth knowing beyond callback/wrapper: event, method, effect/speed, progress, disable-refocus, prevent, and url/options to target a different route; 'replace' as a method alias is gone in Drupal 11.",
    "A custom command is a PHP class implementing CommandInterface plus a function on Drupal.AjaxCommands.prototype, shipped in a library that depends on core/drupal.ajax and attached with addAttachments().",
  ],

  interview: [
    {
      q: "Walk me through the difference between returning a render array and returning an AjaxResponse from an #ajax callback.",
      a: "Both are legal return types and core normalises them. If you return a render array (or a string), `FormAjaxResponseBuilder` passes it to the ajax main-content renderer, `AjaxRenderer::renderResponse()`, which renders it and adds an `InsertCommand(NULL, $html)` — plus a prepended status-messages command when there are messages. The `NULL` selector is resolved in ajax.js to `#ajax['wrapper']`, and the insert method comes from `#ajax['method']`, `replaceWith` by default but configurable. Returning a `Drupal\\Core\\Ajax\\AjaxResponse` skips that convenience layer: you call `addCommand()` for each change and core serialises the queue to JSON for `Drupal.AjaxCommands` to execute in order. Use the render array for the plain dependent-dropdown case, and the response object as soon as you need a second target — a status message, a class toggle, a dialog, a redirect. Note that command content can still be a render array, so you keep cache metadata and `#attached` libraries either way.",
    },
    {
      q: "How would you open a custom form in a modal, and what changes if the client wants it in the off-canvas tray instead?",
      a: "The cheap path is a link render array with `'class' => ['use-ajax']`, `'data-dialog-type' => 'modal'`, `'data-dialog-options' => Json::encode(['width' => 640])`, and `core/drupal.dialog.ajax` attached. Core's ajax.js intercepts the click, requests the route with `_wrapper_format=drupal_modal`, and the `DialogRenderer` wraps whatever the controller returns — so the controller can stay a normal render-array controller that returns `$this->formBuilder()->getForm(...)`. For off-canvas you swap in `data-dialog-type='dialog'` plus `data-dialog-renderer='off_canvas'`; the response then pulls in `core/drupal.dialog.off_canvas`, which is the same tray Settings Tray uses and which applies its own stripped-back theming. If you need commands alongside the dialog, return an `AjaxResponse` with `OpenModalDialogCommand` or `OpenOffCanvasDialogCommand` explicitly, and close it later with `CloseModalDialogCommand`. Off-canvas is styled deliberately narrow, so it suits short triage forms rather than a twenty-field editor.",
    },
    {
      q: "You're coming from Symfony UX Turbo. What's the honest comparison with Drupal's AJAX framework?",
      a: "Architecturally they are the same bet: the server stays the source of truth and ships HTML plus an action verb, rather than JSON to a client-side model. Turbo Streams give you seven actions (`append`, `prepend`, `replace`, `update`, `remove`, `before`, `after`) declared in Twig; Drupal gives you around forty PHP command classes assembled in a controller or form callback. Turbo's extension point is `Turbo.StreamActions.myAction`; Drupal's is `Drupal.AjaxCommands.prototype.myCommand` backed by a PHP class implementing `CommandInterface`. The practical differences are that Drupal binds the client side for you from an `#ajax` array — no Stimulus controller to write — and that a Drupal AJAX response can attach new libraries and drupalSettings mid-flight, whereas Turbo assumes the assets are already on the page.",
    },
    {
      q: "An #ajax interaction works the first time and then stops. What do you check?",
      a: "Almost always the wrapper got destroyed. `ReplaceCommand` and the default `method` of `replaceWith` swap out the element you targeted, so if your replacement markup doesn't itself carry the wrapper id, the second request has nothing to hit. The fix is either to keep `#prefix`/`#suffix` on the rebuilt element so the id comes back, or to use `HtmlCommand` and replace only the contents of a stable outer div. The other usual suspects are behaviours: content inserted by AJAX only gets behaviours attached if you use core's insert path and guard your own JS with `once()`, otherwise handlers are either missing or double-bound. And check the wrapper/selector distinction — `#ajax['wrapper']` is a bare id, command selectors need the `#`.",
    },
  ],

  quiz: [
    {
      question:
        "Your callback returns an AjaxResponse whose first command is ReplaceCommand('#severity-wrapper', $markup), where $markup has no id. The next change to the category select does nothing. Why?",
      options: [
        "AjaxResponse can only be returned once per form build",
        "replaceWith removed the element carrying id 'severity-wrapper', so there is no longer a target in the DOM",
        "ReplaceCommand requires a render array, not a markup string",
        "Core disables #ajax on an element after its first successful response",
      ],
      answerIndex: 1,
      explain:
        "ReplaceCommand maps to jQuery replaceWith: the matched element itself is removed and the new content takes its place. If the new content doesn't reproduce the id, the selector matches nothing next time. Keep the id in #prefix/#suffix on the rebuilt element, or use HtmlCommand to replace only the inner content of a stable wrapper.",
    },
    {
      question:
        "Which combination opens a route in the off-canvas tray from a link, without writing any JavaScript?",
      options: [
        "class 'use-ajax' + data-dialog-type='off_canvas'",
        "class 'use-ajax' + data-dialog-type='dialog' + data-dialog-renderer='off_canvas'",
        "class 'ajax-dialog' + data-dialog-options='{\"offCanvas\":true}'",
        "An #ajax array with 'method' => 'offCanvas' on the link element",
      ],
      answerIndex: 1,
      explain:
        "The dialog type stays 'dialog' (non-modal); it's data-dialog-renderer='off_canvas' that selects the off-canvas main-content renderer and sets _wrapper_format accordingly. The page needs core/drupal.dialog.ajax attached for the use-ajax handler; the off-canvas library arrives with the response.",
    },
    {
      question:
        "You add a HighlightCommand PHP class implementing CommandInterface and a Drupal.AjaxCommands.prototype.incidentHighlight function, but nothing happens and the console shows no error. What is the most likely cause?",
      options: [
        "Custom commands must be registered in a *.services.yml file",
        "render() returned a 'command' value that doesn't match the prototype property name, or the JS library was never attached to the response",
        "CommandInterface requires a second method, execute(), which is missing",
        "Custom commands only run inside modal dialogs",
      ],
      answerIndex: 1,
      explain:
        "Dispatch is by string: Drupal.AjaxCommands looks up response.command as a property name, so 'incidentHighlight' in render() must match the prototype key exactly. The other classic miss is forgetting $response->addAttachments(['library' => ['incident_tracker/highlight']]) (with a core/drupal.ajax dependency in libraries.yml), so the function was never defined. No service registration is involved.",
    },
    {
      question:
        "Which #ajax key stops core from moving keyboard focus back to the triggering element after the response is applied?",
      options: ["'prevent' => 'focus'", "'disable-refocus' => TRUE", "'effect' => 'none'", "'progress' => ['type' => 'none']"],
      answerIndex: 1,
      explain:
        "disable-refocus is a boolean #ajax property that suppresses core's default behaviour of restoring focus to the trigger. It matters when your response opens a dialog or moves focus deliberately — otherwise core yanks it back and screen-reader users lose their place. 'prevent' lists other events to suppress, 'effect' controls the visual transition, and 'progress' controls the throbber.",
    },
  ],
};

export default lesson;
