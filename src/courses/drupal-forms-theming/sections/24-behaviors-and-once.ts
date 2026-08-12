import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "behaviors-and-once",
  title: "Drupal.behaviors, once() & the JS Lifecycle",
  part: "Assets, Components & Layout",
  estMinutes: 12,
  summary:
    "Why DOMContentLoaded is the wrong hook in a CMS that keeps injecting markup: write behaviours that re-run for every AJAX/BigPipe/dialog context, guard them with core/once instead of jQuery.once, read server data from drupalSettings, and translate strings with Drupal.t()/Drupal.formatPlural().",

  concept: `
## The page is never "done"

In Symfony you can get away with \`document.addEventListener('DOMContentLoaded', ...)\`
because the controller renders the page and that is the page. Drupal keeps
adding markup after that event: an \`#ajax\` callback replaces a form fragment,
BigPipe streams a placeholder in seconds later, a modal dialog builds a form in
a detached DOM node, Views AJAX swaps a result list, the toolbar and CKEditor 5
render themselves lazily. Anything you bound at DOMContentLoaded is simply
absent from all of that markup.

### attach() runs once per context, not once per page

\`\`\`js
((Drupal, once) => {
  Drupal.behaviors.incidentCard = {
    attach(context, settings) { /* ... */ },
    detach(context, settings, trigger) { /* ... */ },
  };
})(Drupal, once);
\`\`\`

\`Drupal.attachBehaviors(context, settings)\` walks every registered behaviour
and calls \`attach()\`. On page load \`context\` is \`document\`. After an AJAX
insert it is **the inserted element**, so your selectors must be scoped:
\`context.querySelectorAll('.incident-card')\`, never
\`document.querySelectorAll(...)\`. The second argument is \`drupalSettings\` —
the same object as the global, but merged with any settings the AJAX response
brought with it.

Because \`document\` gets passed again and again (BigPipe, dialogs, contrib code
calling \`attachBehaviors\` defensively), \`attach()\` will see the same elements
repeatedly. That is what \`once()\` is for.

### core/once, not jQuery.once

\`\`\`js
once('incident-init', '.incident-card', context).forEach((el) => {
  el.querySelector('.incident-card__ack')
    .addEventListener('click', () => acknowledge(el.dataset.incidentId));
});
\`\`\`

\`once()\` is the standalone **@drupal/once** package (library \`core/once\`,
global \`once\`) that replaced \`jQuery.once\` in Drupal 9.2 — the jQuery version
is gone in 10 and 11. It returns a **plain array of DOM elements** (not a
jQuery object) that did not already carry the id, and stamps
\`data-once="incident-init"\` on them. Siblings: \`once.remove(id, sel, ctx)\`,
\`once.filter(id, sel, ctx)\`, \`once.find(id, ctx)\`. Gotcha: it uses
\`context.querySelectorAll()\`, so an inserted element that *is* the context
will not match its own selector — target a wrapper.

### detach() and its trigger

\`detach(context, settings, trigger)\` runs before Drupal removes or moves
markup. \`trigger\` is \`'unload'\` (element going away — tear down listeners,
timers, \`once.remove()\`), \`'move'\` (being re-parented, e.g. into a dialog) or
\`'serialize'\` (an AJAX submit is about to read the form — flush editor state
into the textarea, as CKEditor 5 does). Ignoring the trigger and always
destroying is a classic bug.

### Server data and translation

Pass PHP data with \`'#attached' => ['drupalSettings' => [...]]\` and read it
from the \`settings\` argument. Translate with \`Drupal.t('Acknowledge')\` and
\`Drupal.formatPlural(n, '1 incident', '@count incidents')\` — locale's extractor
scans literal calls, so the string must be inline.

### Don't assume jQuery

\`core/drupal\` no longer depends on jQuery. If you want it in Drupal 10/11 you
declare \`core/jquery\` yourself — or write vanilla JS, like core now does.
Conceptually this is Stimulus: bind behaviour to elements as they appear,
tear it down when they leave. Different API, same lifecycle.
`,

  comparisons: [
    {
      label: "Binding behaviour to elements that appear later",
      intro:
        "The incident card has an 'Acknowledge' button. The card can be rendered on page load, injected by an AJAX list refresh, or moved into a modal dialog — the handler must be bound exactly once in every case.",
      leftLang: "js",
      rightLang: "js",
      php: `// assets/controllers/incident_card_controller.js
import { Controller } from '@hotwired/stimulus';

export default class extends Controller {
  static targets = ['ack'];
  static values = { id: Number };

  // Stimulus calls connect() once per element, every time that element
  // enters the DOM: first render, Turbo Frame swap, innerHTML replacement.
  connect() {
    this.onAck = this.onAck.bind(this);
    this.ackTarget.addEventListener('click', this.onAck);
  }

  // ...and disconnect() when it leaves. No double-binding to guard against:
  // the MutationObserver in the Stimulus application tracks identity for you.
  disconnect() {
    this.ackTarget.removeEventListener('click', this.onAck);
  }

  onAck() {
    fetch(\`/incident/\${this.idValue}/ack\`, { method: 'POST' });
  }
}

{# templates/incident/_card.html.twig #}
{# <div {{ stimulus_controller('incident-card', { id: incident.id }) }}> #}`,
      ts: `// incident_tracker/js/incident-card.js
((Drupal, once) => {
  Drupal.behaviors.incidentCard = {
    attach(context, settings) {
      // once() returns ONLY the cards not already initialised in this DOM,
      // and stamps data-once="incident-init" on them.
      once('incident-init', '.incident-card', context).forEach((card) => {
        const ack = card.querySelector('.incident-card__ack');
        ack.addEventListener('click', () => {
          fetch(settings.incidentTracker.ackUrl + '/' + card.dataset.incidentId, {
            method: 'POST',
          });
        });
      });
    },

    detach(context, settings, trigger) {
      // 'move' means the card is being re-parented into a dialog -- keep it.
      if (trigger !== 'unload') {
        return;
      }
      once.remove('incident-init', '.incident-card', context).forEach((card) => {
        clearInterval(card.incidentTimer);
      });
    },
  };
})(Drupal, once);`,
      note: "Stimulus tracks element identity itself; Drupal does not — attach() is re-invoked blindly, so once() (or your own guard) is what stops N handlers piling up on the same button.",
    },
    {
      label: "Handing server data to the script",
      intro:
        "The behaviour needs a URL to POST to and a poll interval. In Symfony you print them into the template; in Drupal you attach them to the render array.",
      leftLang: "twig",
      rightLang: "php",
      php: `{# templates/incident/dashboard.html.twig #}
{{ encore_entry_script_tags('incident') }}

<div class="incident-board"
     data-ack-url="{{ path('incident_ack', { id: '__ID__' }) }}"
     data-poll-interval="{{ poll_interval }}"
     data-severities="{{ severities|json_encode }}">
  {% for incident in incidents %}
    {{ include('incident/_card.html.twig') }}
  {% endfor %}
</div>

{# JS side:
   const board = document.querySelector('.incident-board');
   const severities = JSON.parse(board.dataset.severities);
   Per-instance config, scoped to the element that needs it. #}`,
      ts: `<?php
// IncidentBoardController::build()
$url = Url::fromRoute('incident_tracker.ack')->toString(TRUE);

$build['board'] = [
  '#theme' => 'incident_board',
  '#incidents' => $incidents,
  '#attached' => [
    'library' => ['incident_tracker/card-behaviour'],
    'drupalSettings' => [
      'incidentTracker' => [
        'ackUrl' => $url->getGeneratedUrl(),
        'pollInterval' => 30000,
        'severities' => ['low', 'high', 'critical'],
      ],
    ],
  ],
];
// Bubble the URL's cacheability instead of losing it.
// Merge -- do NOT applyTo() blindly: it REPLACES #attached, which would
// wipe out the library and drupalSettings set above.
BubbleableMetadata::createFromRenderArray($build['board'])
  ->merge(BubbleableMetadata::createFromObject($url))
  ->applyTo($build['board']);

// JS side: Drupal.behaviors.x.attach(context, settings) ->
//   settings.incidentTracker.ackUrl
// (drupalSettings is also a global, but always prefer the argument:
//  an AJAX response merges its own settings into it before attach() runs.)`,
      note: "drupalSettings is one global JSON blob printed into the page and merged by every AJAX response — it is page-level, never per-instance, and never a place for secrets or per-user data you have not added a cache context for. For per-card values keep using data-* attributes.",
    },
    {
      label: "Translatable strings in JavaScript",
      intro:
        "A count of open incidents has to be pluralised and translated client-side, after an AJAX refresh recalculates it.",
      leftLang: "js",
      rightLang: "js",
      php: `// Symfony keeps the Translator on the server, so the usual options are:

// 1) Render the translated string and read it back from the DOM.
//    <button data-label-ack="{{ 'incident.ack'|trans }}">
const label = button.dataset.labelAck;

// 2) Ship the catalogue to the browser (willdurand/js-translation-bundle):
import Translator from 'bazinga-translator';
Translator.trans('incident.ack');
Translator.trans('incident.open_count', { count: n }, 'messages');

// Extraction is handled by bin/console translation:extract --force en`,
      ts: `// Drupal ships Drupal.t()/Drupal.formatPlural() in core/drupal,
// and locale delivers the per-language strings as a JS translation file.
button.textContent = Drupal.t('Acknowledge');

status.textContent = Drupal.t('@name acknowledged incident @id', {
  '@name': settings.user.name,   // @ placeholders are escaped for you
  '@id': id,
});

counter.textContent = Drupal.formatPlural(
  count,
  '1 open incident',
  '@count open incidents',
);

// Same word, different meaning -> give translators a context:
badge.textContent = Drupal.t('Open', {}, { context: 'Incident status' });`,
      note: "locale's extractor greps your .js files for literal Drupal.t()/Drupal.formatPlural() calls — Drupal.t(someVariable) compiles fine and is silently untranslatable. Untranslated sites still work: Drupal.t() falls back to the source string.",
    },
    {
      label: "Declaring the asset and its dependencies",
      intro:
        "Where the browser learns that this file exists, and what has to be loaded before it.",
      leftLang: "js",
      rightLang: "yaml",
      php: `// webpack.config.js
Encore
  .addEntry('incident', './assets/incident.js')
  .enableStimulusBridge('./assets/controllers.json')
  .enableVersioning()
  .splitEntryChunks();

// assets/incident.js
import './styles/incident.css';
import { startStimulusApp } from '@symfony/stimulus-bridge';

// Dependencies are resolved by the bundler; the browser gets one graph.
// Twig prints the tags: {{ encore_entry_script_tags('incident') }}`,
      ts: `# incident_tracker.libraries.yml
# The behaviour is what the card needs to FUNCTION, so it belongs to the
# module that renders the card -- not to the theme.
card-behaviour:
  version: 1.x
  js:
    js/incident-card.js: {}
  css:
    component:
      css/incident-card.css: {}
  dependencies:
    - core/drupal        # Drupal.behaviors, Drupal.t, Drupal.formatPlural
    - core/once          # the global once()

# Attach it from PHP ('#attached' => ['library' => [...]]), from a preprocess
# hook, from Twig ({{ attach_library('incident_tracker/card-behaviour') }}),
# or globally via the extension's *.info.yml libraries: key.
# NOTE: core/drupal does NOT pull in jQuery in Drupal 10/11. If you really
# need it, depend on core/jquery explicitly.`,
      note: "Drupal resolves the dependency graph server-side per request and emits ordered <script> tags — there is no bundler. Declaring core/once but forgetting core/drupal (or vice versa) is the usual cause of 'once is not defined' / 'Drupal is not defined' in the console.",
    },
  ],

  playground: {
    intro:
      "A miniature model of the JS lifecycle in plain PHP. It replays four attachBehaviors() passes with different contexts — page load, an AJAX insert, a BigPipe replacement and a re-attach after a dialog unload — and counts how many click handlers end up on each card with once() versus without it.",
    lang: "php",
    code: `<?php
// Elements are ids; "data-once" is the attribute core/once writes on them.
$dataOnce = [];                 // element id => list of once ids applied
$handlers = ['once' => [], 'naive' => []];

// once(id, selector, context) -> the elements that did NOT have the id yet.
function once(string $id, array $context, array &$dataOnce): array {
  $fresh = [];
  foreach ($context as $el) {
    $applied = $dataOnce[$el] ?? [];
    if (!in_array($id, $applied, TRUE)) {
      $applied[] = $id;
      sort($applied);
      $dataOnce[$el] = $applied;
      $fresh[] = $el;
    }
  }
  return $fresh;
}

// once.remove(id, selector, context) -> what detach() should call.
function once_remove(string $id, array $context, array &$dataOnce): array {
  $cleared = [];
  foreach ($context as $el) {
    $applied = $dataOnce[$el] ?? [];
    if (in_array($id, $applied, TRUE)) {
      $dataOnce[$el] = array_values(array_diff($applied, [$id]));
      $cleared[] = $el;
    }
  }
  return $cleared;
}

// Every time Drupal calls attachBehaviors() it passes a DIFFERENT context.
$passes = [
  ['label' => 'page load       context=document      ', 'cards' => ['card-1', 'card-2']],
  ['label' => 'ajax insert     context=#incident-list', 'cards' => ['card-3']],
  ['label' => 'bigpipe replace context=document      ', 'cards' => ['card-1', 'card-2', 'card-3']],
];

foreach ($passes as $pass) {
  $fresh = once('incident-init', $pass['cards'], $dataOnce);
  foreach ($fresh as $el) {
    $handlers['once'][$el] = ($handlers['once'][$el] ?? 0) + 1;
  }
  // The same behaviour written without once(): it binds on every pass.
  foreach ($pass['cards'] as $el) {
    $handlers['naive'][$el] = ($handlers['naive'][$el] ?? 0) + 1;
  }
  printf("%s -> once() yields: %s\\n", $pass['label'], $fresh ? implode(', ', $fresh) : '(none)');
}

// A dialog closes: Drupal.detachBehaviors(el, settings, 'unload').
$cleared = once_remove('incident-init', ['card-2'], $dataOnce);
printf("\\ndetach(trigger=unload)  -> once.remove cleared: %s\\n", implode(', ', $cleared));

// ...and the same markup is re-inserted, so attach() runs again.
$reattach = ['card-1', 'card-2', 'card-3'];
$fresh = once('incident-init', $reattach, $dataOnce);
foreach ($fresh as $el) {
  $handlers['once'][$el] = ($handlers['once'][$el] ?? 0) + 1;
}
foreach ($reattach as $el) {
  $handlers['naive'][$el] = ($handlers['naive'][$el] ?? 0) + 1;
}
printf("re-attach after unload  -> once() yields: %s\\n", implode(', ', $fresh));

echo "\\nclick handlers bound per card:\\n";
foreach (['card-1', 'card-2', 'card-3'] as $el) {
  printf("  %-7s with once(): %d   without once(): %d\\n",
    $el, $handlers['once'][$el] ?? 0, $handlers['naive'][$el] ?? 0);
}

echo "\\ndata-once attribute left in the DOM:\\n";
print_r($dataOnce);`,
    output: `page load       context=document       -> once() yields: card-1, card-2
ajax insert     context=#incident-list -> once() yields: card-3
bigpipe replace context=document       -> once() yields: (none)

detach(trigger=unload)  -> once.remove cleared: card-2
re-attach after unload  -> once() yields: card-2

click handlers bound per card:
  card-1  with once(): 1   without once(): 3
  card-2  with once(): 2   without once(): 3
  card-3  with once(): 1   without once(): 3

data-once attribute left in the DOM:
Array
(
    [card-1] => Array
        (
            [0] => incident-init
        )

    [card-2] => Array
        (
            [0] => incident-init
        )

    [card-3] => Array
        (
            [0] => incident-init
        )

)`,
  },

  keyPoints: [
    "DOMContentLoaded fires once; Drupal keeps injecting markup afterwards (AJAX, BigPipe, dialogs, Views AJAX, CKEditor 5), so initialisation belongs in \`Drupal.behaviors.x.attach(context, settings)\`, which Drupal re-runs for every new context.",
    "\`context\` is \`document\` on page load and **the inserted element** after AJAX — always scope with \`context.querySelectorAll(...)\`; \`settings\` is drupalSettings already merged with anything the AJAX response added.",
    "\`once('id', selector, context)\` (library \`core/once\`, the standalone @drupal/once package that replaced jQuery.once in 9.2) returns a plain **array of elements** not yet stamped with \`data-once=\"id\"\`; \`once.remove()\`, \`once.filter()\` and \`once.find()\` complete the API.",
    "\`detach(context, settings, trigger)\` gets \`'unload'\`, \`'move'\` or \`'serialize'\` — only tear down on \`'unload'\`; \`'serialize'\` means an AJAX submit is about to read the form and you should flush editor state into the real input.",
    "Server data reaches JS through \`'#attached' => ['drupalSettings' => [...]]\` — a page-global blob merged across AJAX responses, so use \`data-*\` attributes for per-instance config and mind the cache contexts of anything user-specific you put in it.",
    "\`Drupal.t()\` / \`Drupal.formatPlural()\` must be called with literal strings for locale's extractor to find them, and \`core/drupal\` no longer implies jQuery in Drupal 10/11 — declare \`core/jquery\` if you truly need it.",
  ],

  interview: [
    {
      q: "Why is DOMContentLoaded (or jQuery's document ready) the wrong place to initialise JavaScript in Drupal?",
      a: "Because in Drupal the DOM keeps growing after that event. An \`#ajax\` callback replaces a form fragment, BigPipe streams placeholder replacements in after the initial flush, modal dialogs build their contents in a detached node, Views AJAX swaps result lists — none of that markup exists when DOMContentLoaded fires, so anything bound there simply misses it. The framework's answer is \`Drupal.behaviors.myThing.attach(context, settings)\`: Drupal calls \`attachBehaviors()\` with \`document\` on page load and again with each newly inserted element, so the same initialisation code runs for old and new markup. In Symfony terms it is the same reason you reach for a Stimulus controller instead of a ready handler once Turbo is in play — the difference is that Stimulus tracks element identity for you, while Drupal re-invokes \`attach()\` blindly and expects you to guard it.",
    },
    {
      q: "What does once() do, and how is it different from the jQuery.once you may have seen in Drupal 7/8 code?",
      a: "\`once(id, selector, context)\` finds the elements in \`context\` matching \`selector\` that do not already carry \`data-once=\"id\"\`, stamps them, and returns them — so a behaviour that is attached five times still binds its handlers once per element. In Drupal 9.2 core replaced the jQuery plugin with the standalone **@drupal/once** package, exposed as the global \`once\` via the \`core/once\` library; the jQuery version is gone in 10 and 11, so \`$('.x').once('y')\` is a straight port target. The practical differences are that it returns a **plain array** of DOM elements (use \`.forEach\`, not \`.each\`), you must declare \`core/once\` as a dependency in your \`*.libraries.yml\`, and there are companions \`once.remove()\`, \`once.filter()\` and \`once.find()\`. One gotcha worth mentioning: it uses \`context.querySelectorAll()\`, so if the AJAX-inserted element *is* the context it will not match its own selector.",
    },
    {
      q: "How do you get data from PHP into a behaviour, and what should you be careful about?",
      a: "Attach it to the render array: \`'#attached' => ['drupalSettings' => ['incidentTracker' => [...]]]\`. Drupal serialises the merged settings into a \`<script type=\"application/json\" data-drupal-selector=\"drupal-settings-json\">\` blob and hands it to every behaviour as the second \`attach()\` argument — prefer that argument to the global, because an AJAX response merges its own settings in before \`attach()\` runs. The caveats are that drupalSettings is page-global rather than per-element, so per-instance values are better expressed as \`data-*\` attributes on the markup; that everything in it is visible to the client, so no secrets; and that user-specific values need the right cache contexts on the build or you will serve one user's settings to another. If you generate a URL, use \`Url::…->toString(TRUE)\` so the returned \`GeneratedUrl\` still carries the cacheability the outbound path processors added, then **merge** it into the build — \`BubbleableMetadata::createFromRenderArray($build)->merge(BubbleableMetadata::createFromObject($url))->applyTo($build)\` — because a bare \`$url->applyTo($build)\` assigns \`#attached\` outright and would silently delete the library and drupalSettings you just attached.",
    },
    {
      q: "When is detach() called, and what does the trigger argument mean?",
      a: "Drupal calls \`Drupal.detachBehaviors(context, settings, trigger)\` before it removes or relocates markup, and the third argument tells you why. \`'unload'\` means the element is going away for good — remove listeners, clear intervals, disconnect observers, and call \`once.remove()\` so a later re-insertion re-initialises cleanly. \`'move'\` means the same nodes are being re-parented, typically into a dialog, so you should generally leave your state alone. \`'serialize'\` fires just before an AJAX submit reads the form values, which is your cue to flush any client-side editor state into the underlying input — exactly what CKEditor 5 does with its textarea. Writing \`detach()\` as an unconditional teardown is a common bug: it breaks anything that gets moved rather than removed.",
    },
  ],

  quiz: [
    {
      question:
        "After an #ajax callback replaces a form fragment, what is the value of `context` when your behaviour's `attach()` runs?",
      options: [
        "`document`, exactly as on page load",
        "The newly inserted element (or wrapper) — not the whole document",
        "`window`, with the new markup in `settings.ajax`",
        "`document.body`, because AJAX responses always re-attach globally",
      ],
      answerIndex: 1,
      explain:
        "Drupal calls `Drupal.attachBehaviors(newContent, settings)` with the inserted content as the context, so only that subtree is re-processed. That is why selectors must be scoped to `context` — using `document.querySelectorAll()` re-scans the whole page on every AJAX response and re-binds everything.",
    },
    {
      question: "What does `once('incident-init', '.incident-card', context)` return?",
      options: [
        "A jQuery object of all `.incident-card` elements in the context",
        "A boolean saying whether the behaviour has already run",
        "A plain array of the `.incident-card` elements that were not yet stamped with `data-once=\"incident-init\"`",
        "The number of elements it initialised",
      ],
      answerIndex: 2,
      explain:
        "core/once returns a real Array of DOM elements — iterate with `.forEach()`. It marks each returned element with `data-once=\"incident-init\"`, so the next `attach()` pass over the same DOM returns an empty array and nothing is double-bound.",
    },
    {
      question:
        "Your Drupal 10 theme's JS throws `Uncaught ReferenceError: once is not defined`. What is the most likely cause?",
      options: [
        "jQuery is missing — once() is a jQuery plugin",
        "The library declaration is missing `core/once` in its `dependencies`",
        "`once()` was removed in Drupal 10 in favour of `Drupal.once()`",
        "The file must be loaded in the header, not the footer",
      ],
      answerIndex: 1,
      explain:
        "The global `once` comes from the `core/once` library (the standalone @drupal/once package). Nothing loads it implicitly, so your `*.libraries.yml` entry must list it under `dependencies`, usually alongside `core/drupal` and `core/drupalSettings`. It is not a jQuery plugin — jQuery.once was removed in Drupal 10.",
    },
    {
      question:
        "CKEditor 5 replaces a textarea. Which `detach()` trigger tells your behaviour that an AJAX submit is about to read the form values?",
      options: ["'unload'", "'move'", "'serialize'", "'submit'"],
      answerIndex: 2,
      explain:
        "`'serialize'` fires just before Drupal's AJAX system serialises the form, so it is where you push client-side editor state back into the real input element. `'unload'` means the markup is being removed (tear everything down); `'move'` means it is being re-parented and you should usually leave state intact. There is no `'submit'` trigger.",
    },
  ],
};

export default lesson;
