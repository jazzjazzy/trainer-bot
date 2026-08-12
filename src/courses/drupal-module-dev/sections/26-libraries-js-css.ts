import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "libraries-js-css",
  title: "Attaching JS & CSS: libraries.yml & drupalSettings",
  part: "Polish & Ship",
  estMinutes: 12,
  summary:
    "Ship the incident dashboard's front-end the Drupal way: declare a library in incident_tracker.libraries.yml, attach it per render array, pass server data via drupalSettings, and write AJAX-proof JS with Drupal.behaviors and once().",

  concept: `
## Declarative assets — no build step, no tags

In Symfony you push assets through a mapping or build layer — Webpack Encore
entries, or AssetMapper's importmap — then print tags in Twig. Drupal replaces
all of that with one declarative file, \`incident_tracker.libraries.yml\`. A
**library** is a named bundle of CSS + JS + dependencies. You never write a
\`<script>\` tag: Drupal's asset system orders files by dependency, dedupes,
aggregates and minifies on delivery, and plain CSS/JS needs no build step at
all.

\`\`\`yaml
severity-dashboard:
  version: 1.0.0
  css:
    component:                   # SMACSS category = output ordering
      css/dashboard.css: {}
  js:
    js/dashboard.js: {}
  dependencies:
    - core/drupal                # Drupal.behaviors, Drupal.t()
    - core/once                  # the once() helper
    - core/drupalSettings        # server -> JS data bridge
\`\`\`

Two details trip people up:

- CSS nests under a **SMACSS category** (\`base\`, \`layout\`, \`component\`,
  \`state\`, \`theme\`), and the category decides load order. A module's own
  widget styles normally go in \`component\`; \`theme\` is for skinnable,
  overridable presentation — colours, decoration, print — which is exactly
  why \`theme\` is emitted last, so a theme's rules win. Per-file
  options ride in the braces: \`{ media: print }\`, \`{ minified: true }\`,
  \`{ preprocess: false }\` to keep a file out of aggregation,
  \`{ attributes: { defer: true } }\`, or \`header: true\` on the whole library
  to force JS into the head instead of the footer.
- **jQuery is opt-in** in Drupal 10/11 — core moved off it. Depend on
  \`core/jquery\` only if you actually use \`$\`.

## Nothing loads until you attach it

Declaring a library does nothing by itself. You attach it to a **render array**
— \`'#attached' => ['library' => ['incident_tracker/severity-dashboard']]\` —
on the exact block, form or controller result that needs it. Attachments
**bubble** through render caching: a render-cached dashboard block still
delivers its CSS/JS on a cache hit. For genuinely site-wide assets implement
\`hook_page_attachments()\` in the \`.module\` file (or a
\`#[Hook('page_attachments')]\` method on a class in \`src/Hook\` on Drupal
11.1+).

## drupalSettings: server data for your JS

Alongside \`library\`, attach
\`'drupalSettings' => ['incidentTracker' => [...]]\` — severity counts, a
refresh interval, a URL. Drupal deep-merges every attachment on the page into
one JSON blob your JS reads as \`drupalSettings.incidentTracker\` (also handed
to behaviors as the \`settings\` argument). Morally it is Stimulus values,
assembled centrally from any render array rather than printed by one template.

## Behaviors + once(): the AJAX gotcha

\`DOMContentLoaded\` fires once per full page load — but Drupal pages keep
mutating afterwards: AJAX form rebuilds, Views pagers, dialogs and BigPipe all
insert markup later, and a plain \`DOMContentLoaded\` handler never sees it.
The Drupal contract instead: register
\`Drupal.behaviors.incidentDashboard = { attach(context, settings) {...} }\`
and core re-runs every behavior after each insertion, passing the new fragment
as \`context\`. Because \`attach()\` runs many times over overlapping DOM, make
it idempotent with \`once('incident-dashboard', '.incident-dashboard', context)\`
— it returns only the plain DOM elements (no jQuery) not yet processed under
that id, and marks them. A behavior is a Stimulus \`connect()\` whose trigger is
Drupal's render pipeline, with \`detach()\` as its \`disconnect()\`.

Libraries you don't own are still yours to bend: a theme's \`.info.yml\` can
\`libraries-override\` a file away or \`libraries-extend\` yours onto someone
else's, and modules use \`hook_library_info_alter()\`.
`,

  comparisons: [
    {
      label: "Declaring the asset bundle",
      intro:
        "Both frameworks want assets declared, not hand-written as tags — Symfony maps entries for a build/import layer, Drupal names a bundle of files plus its dependencies in YAML.",
      rightLang: "yaml",
      php: `<?php
// Symfony (AssetMapper): importmap.php maps logical names to files.
// Webpack Encore is the build-step alternative (webpack.config.js
// with Encore.addEntry('dashboard', './assets/dashboard.js')).
// Twig prints the tags: {{ importmap('dashboard') }}.
return [
    'app' => [
        'path' => './assets/app.js',
        'entrypoint' => true,
    ],
    'dashboard' => [
        'path' => './assets/dashboard.js',
        'entrypoint' => true,
        // CSS is pulled in FROM the JS:
        //   import '../styles/dashboard.css';
    ],
    '@hotwired/stimulus' => [
        'version' => '3.2.2',
    ],
];`,
      ts: `# incident_tracker.libraries.yml — a named bundle of CSS + JS
# + dependencies. Paths are relative to the module folder.
# No build step; Drupal aggregates & minifies on delivery.
severity-dashboard:
  version: 1.0.0
  css:
    component:                # your own widget styles
      css/dashboard.css: {}
    theme:                    # skinnable/overridable — loads last
      css/dashboard-print.css: { media: print }
  js:
    js/dashboard.js: {}
  dependencies:
    - core/drupal             # Drupal.behaviors, Drupal.t()
    - core/once               # the once() helper
    - core/drupalSettings     # server -> JS data bridge

# jQuery is OPT-IN in Drupal 10/11 — core moved off it.
# Add '- core/jquery' only if your JS actually uses $.`,
      note:
        "The full library name is module/key: incident_tracker/severity-dashboard. Dependencies guarantee load order — your JS never races Drupal.behaviors or once(). Library definitions are cached: drush cr after editing the YAML.",
    },
    {
      label: "Attaching per page + passing server data",
      intro:
        "The dashboard controller needs its assets and its severity counts delivered together. Symfony hands data to Twig for data-* attributes; Drupal rides both on the render array itself.",
      php: `<?php
// Symfony: controller passes data to Twig, which feeds Stimulus
// through data-*-value attributes on the controller element.
use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\Routing\\Attribute\\Route;

final class DashboardController extends AbstractController
{
    #[Route('/dashboard', name: 'incident_dashboard')]
    public function __invoke(IncidentRepository $incidents): Response
    {
        return $this->render('dashboard/index.html.twig', [
            'counts' => $incidents->countBySeverity(),
        ]);
    }
}

/* dashboard/index.html.twig:
<div data-controller="dashboard"
     data-dashboard-counts-value=
       "{{ counts|json_encode|e('html_attr') }}"
     data-dashboard-refresh-value="30"
     class="incident-dashboard"></div>
*/`,
      ts: `<?php
// Drupal: the render array carries markup, assets AND data.
// Attachments bubble with render caching — a cached copy of
// this build still delivers the library and settings.
final class DashboardController extends ControllerBase {

  // $this->repository injected via create() as usual.

  public function build(): array {
    return [
      '#type' => 'container',
      '#attributes' => ['class' => ['incident-dashboard']],
      '#attached' => [
        'library' => ['incident_tracker/severity-dashboard'],
        'drupalSettings' => [
          'incidentTracker' => [
            'counts' => $this->repository->countBySeverity(),
            'refreshSeconds' => 30,
          ],
        ],
      ],
      '#cache' => ['tags' => ['incident_tracker:list']],
    ];
  }

}`,
      note:
        "All drupalSettings on a page deep-merge into one object your JS reads as drupalSettings.incidentTracker. For small per-element values, data-* attributes via '#attributes' work in Drupal too — drupalSettings shines for structured, page-level data.",
    },
    {
      label: "The JavaScript: Stimulus connect() vs behaviors + once()",
      intro:
        "Both solve 'initialize this widget whenever it appears, even after AJAX'. Stimulus watches the DOM with a MutationObserver; Drupal re-runs attach() from its render pipeline, and once() keeps it idempotent.",
      leftLang: "js",
      rightLang: "js",
      php: `// assets/controllers/dashboard_controller.js
// Stimulus: connect() fires for EVERY element with
// data-controller="dashboard", however it got into the DOM.
import { Controller } from '@hotwired/stimulus';

export default class extends Controller {
  static values = { counts: Object, refresh: Number };

  connect() {
    this.render(this.countsValue);
    this.timer = setInterval(
      () => this.refreshCounts(),
      this.refreshValue * 1000,
    );
  }

  disconnect() {
    clearInterval(this.timer);
  }

  render(counts) { /* paint severity tiles */ }
  refreshCounts() { /* fetch + re-render */ }
}`,
      ts: `// js/dashboard.js — Drupal re-runs attach() after every AJAX /
// BigPipe insertion, passing the new fragment as 'context'.
(function (Drupal, once) {
  'use strict';

  const timers = new WeakMap();

  Drupal.behaviors.incidentDashboard = {
    attach(context, settings) {
      // Plain DOM elements not yet processed under this id —
      // no jQuery. Marks them data-once="incident-dashboard".
      once('incident-dashboard', '.incident-dashboard', context)
        .forEach((el) => {
          const cfg = settings.incidentTracker || {};
          Object.entries(cfg.counts || {}).forEach(([sev, n]) => {
            const cell = el.querySelector('[data-severity="' + sev + '"]');
            if (cell) { cell.textContent = n; }
          });
          timers.set(el, setInterval(
            () => el.classList.toggle('is-stale'),
            cfg.refreshSeconds * 1000,
          ));
        });
    },
    detach(context, settings, trigger) {
      // trigger is 'unload' | 'move' | 'serialize'.
      if (trigger !== 'unload') { return; }
      once.remove('incident-dashboard', '.incident-dashboard', context)
        .forEach((el) => clearInterval(timers.get(el)));
    },
  };

})(Drupal, once);`,
      note:
        "The classic bug: wiring the widget in DOMContentLoaded works on full page loads, then silently skips every AJAX-inserted copy. attach(context) + once() is the contract that survives AJAX, dialogs and BigPipe.",
    },
    {
      label: "Site-wide assets",
      intro:
        "Truly global assets: Symfony puts them in the base layout every template extends; Drupal adds them from a hook that runs on every page — conditionally, if you like.",
      leftLang: "html",
      php: `{# templates/base.html.twig — global assets live in the base
   layout; every page template extends it. #}
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>{% block title %}Incidents{% endblock %}</title>
    {% block javascripts %}
      {{ importmap('app') }}
      {# Encore flavour:
         {{ encore_entry_link_tags('app') }}
         {{ encore_entry_script_tags('app') }} #}
    {% endblock %}
  </head>
  <body>{% block body %}{% endblock %}</body>
</html>`,
      ts: `<?php
// incident_tracker.module — Drupal 10 & 11 procedural style.

/**
 * Implements hook_page_attachments().
 */
function incident_tracker_page_attachments(array &$attachments): void {
  // Global, but still conditional — only for users who may
  // see incidents at all.
  if (\\Drupal::currentUser()->hasPermission('view incident reports')) {
    $attachments['#attached']['library'][] =
      'incident_tracker/severity-dashboard';
  }
  // Because the decision varies by permission, the page must
  // vary too — or the anonymous page cache serves the wrong copy.
  $attachments['#cache']['contexts'][] = 'user.permissions';
}

// Drupal 11.1+ OOP flavour — src/Hook/IncidentTrackerHooks.php:
//
//   #[Hook('page_attachments')]
//   public function pageAttachments(array &$attachments): void {
//     $attachments['#attached']['library'][] =
//       'incident_tracker/severity-dashboard';
//   }`,
      note:
        "Prefer per-render-array attachment: it keeps assets off pages that don't need them. hook_page_attachments is for the rare genuinely-global case — and any condition you branch on must be declared as a cache context.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "The whole front-end pipeline in plain PHP: dependency-ordered library resolution with dedupe, deep-merged drupalSettings, then behaviors re-running with once() as AJAX inserts markup. Predict the output, then run.",
    code: `<?php
// Simulate Drupal's asset pipeline: library resolution from libraries.yml,
// drupalSettings merging, and Drupal.behaviors re-running with once().

// --- 1. The registry: what *.libraries.yml files declare. ---
$registry = [
    'core/drupal'         => ['assets' => ['core/misc/drupal.js'], 'deps' => []],
    'core/once'           => ['assets' => ['core/assets/vendor/once/once.min.js'], 'deps' => []],
    'core/drupalSettings' => ['assets' => ['core/misc/drupalSettingsLoader.js'], 'deps' => []],
    'incident_tracker/severity-dashboard' => [
        'assets' => ['css/dashboard.css', 'js/dashboard.js'],
        'deps'   => ['core/drupal', 'core/once', 'core/drupalSettings'],
    ],
];

// Depth-first resolve: dependencies load BEFORE the library, each one once.
function resolve(string $name, array $registry, array &$ordered): void {
    if (in_array($name, $ordered, true)) {
        return;
    }
    foreach ($registry[$name]['deps'] as $dep) {
        resolve($dep, $registry, $ordered);
    }
    $ordered[] = $name;
}

// A block AND a controller both #attach the same library — dedupe is free.
$ordered = [];
foreach (['incident_tracker/severity-dashboard',
          'incident_tracker/severity-dashboard'] as $lib) {
    resolve($lib, $registry, $ordered);
}
echo "Aggregated load order (deps first, deduped):\\n";
foreach ($ordered as $i => $name) {
    echo "  " . ($i + 1) . ". " . $name . "\\n";
}

// --- 2. Server -> JS data: '#attached' drupalSettings, deep-merged. ---
$settings = [];
$attachments = [
    ['incidentTracker' => ['refreshSeconds' => 30]],                      // block
    ['incidentTracker' => ['counts' => ['critical' => 2, 'major' => 5]]], // controller
];
foreach ($attachments as $attached) {
    $settings = array_replace_recursive($settings, $attached);
}
echo "\\ndrupalSettings.incidentTracker = "
    . json_encode($settings['incidentTracker']) . "\\n";

// --- 3. Drupal.behaviors + once(): attach re-runs after every AJAX insert. ---
$onceSeen = [];   // once() marks elements so they are processed exactly once
$attach = function (array $context) use (&$onceSeen, $settings): void {
    // once('init', '.incident-dashboard', context) -> only unseen elements.
    $fresh = array_values(array_diff($context, $onceSeen));
    $onceSeen = array_merge($onceSeen, $fresh);
    foreach ($fresh as $el) {
        echo "  init $el (poll every {$settings['incidentTracker']['refreshSeconds']}s)\\n";
    }
    if ($fresh === []) {
        echo "  nothing new — once() skipped everything\\n";
    }
};

echo "\\nInitial page load, attach(document):\\n";
$attach(['#dash-overview', '#dash-by-service']);

echo "AJAX inserts a pane, attach(new fragment):\\n";
$attach(['#dash-modal']);

echo "Sloppy AJAX re-attach over old markup:\\n";
$attach(['#dash-overview']);

echo "\\nattach() is idempotent thanks to once() — safe to re-run forever.";`,
    output: `Aggregated load order (deps first, deduped):
  1. core/drupal
  2. core/once
  3. core/drupalSettings
  4. incident_tracker/severity-dashboard

drupalSettings.incidentTracker = {"refreshSeconds":30,"counts":{"critical":2,"major":5}}

Initial page load, attach(document):
  init #dash-overview (poll every 30s)
  init #dash-by-service (poll every 30s)
AJAX inserts a pane, attach(new fragment):
  init #dash-modal (poll every 30s)
Sloppy AJAX re-attach over old markup:
  nothing new — once() skipped everything

attach() is idempotent thanks to once() — safe to re-run forever.`,
  },

  keyPoints: [
    "incident_tracker.libraries.yml declares named bundles (a library = CSS under a SMACSS category + JS + dependencies); Drupal orders by dependency, dedupes and aggregates — no build step, no hand-written script tags. Rebuild caches after editing it.",
    "Declaring a library loads nothing: attach it where it's needed with '#attached' => ['library' => ['incident_tracker/severity-dashboard']] on a render array — attachments bubble with render caching, so cached blocks still deliver their assets.",
    "hook_page_attachments() (or a #[Hook('page_attachments')] class method on Drupal 11.1+) attaches libraries globally; prefer per-render-array attachment, and declare a cache context for any condition you branch on.",
    "Server data rides '#attached' => ['drupalSettings' => ['incidentTracker' => [...]]], deep-merges across the page, and is read in JS as drupalSettings.incidentTracker or the settings argument of attach().",
    "Drupal.behaviors.NAME.attach(context, settings) re-runs after every AJAX/BigPipe insertion with the new fragment as context — the lifecycle plain DOMContentLoaded misses; once('id', selector, context) keeps attach() idempotent and returns plain DOM elements.",
    "jQuery is opt-in in Drupal 10/11 (core moved off it): depend on core/jquery only if you use it; the modern trio is core/drupal + core/once + core/drupalSettings.",
  ],

  interview: [
    {
      q: "How do you add CSS and JavaScript to a page from a custom Drupal module, and why not just print a script tag in a template?",
      a: "You declare a **library** in `MODULE.libraries.yml` — CSS files under a SMACSS category, JS files, and dependencies like `core/drupal` and `core/once` — then attach it with `'#attached' => ['library' => ['module/library-name']]` on the render array that needs it (or `hook_page_attachments()` for global). Hand-printed tags bypass everything the asset system gives you: dependency ordering, deduplication when several components want the same file, aggregation and minification, and cacheability — attachments bubble with render caching, so a cache-hit block still delivers its JS. It's the same philosophy as Symfony's Encore/AssetMapper (declare entries, let the pipeline emit tags), except Drupal's version is pure declaration with no build step, and attachment is per-render-array rather than per-template.",
    },
    {
      q: "What problem do Drupal.behaviors and once() solve that a DOMContentLoaded listener doesn't?",
      a: "`DOMContentLoaded` fires exactly once per full page load, but Drupal keeps injecting markup afterwards — AJAX form rebuilds, Views pagers, dialogs, BigPipe placeholders — so widgets inside that new markup never initialize. Drupal re-runs every `Drupal.behaviors.*.attach(context, settings)` after each insertion, passing the inserted fragment as `context`. Since `attach()` can therefore run many times over overlapping DOM, you wrap the work in `once('my-id', '.selector', context)`, which returns only the plain DOM elements not yet processed under that id and marks them with `data-once`. If you've used Stimulus, a behavior is `connect()` with Drupal's render pipeline as the trigger instead of a MutationObserver, and `detach()` is the `disconnect()` counterpart for cleanup (check `trigger === 'unload'` before tearing down).",
    },
    {
      q: "You need severity counts computed in PHP available to your dashboard JS. What are your options in Drupal?",
      a: "The canonical route is `drupalSettings`: attach `'drupalSettings' => ['incidentTracker' => ['counts' => $counts]]` alongside the library (which must depend on `core/drupalSettings`), and read it in JS as `drupalSettings.incidentTracker` — behaviors also receive it as their second `settings` argument. Drupal deep-merges settings from every render array on the page into one JSON blob. The alternative — `data-*` attributes on the element via `'#attributes'` — is better for small per-element values and mirrors how you'd feed a Stimulus controller its values in Symfony. Rule of thumb: structured or page-level data goes in drupalSettings; a single id or flag on one element goes in a data attribute. Never `json_encode()` into an inline script tag yourself — that bypasses caching, aggregation and CSP handling.",
    },
    {
      q: "A contrib module ships a library whose CSS fights your theme. How do you change a library you don't own?",
      a: "Three levers, in order of bluntness. A theme's `.info.yml` can `libraries-override` a library it doesn't own — replace a file path, set one file to `false` to drop it, or set the whole library to `false` — and `libraries-extend` appends your library automatically whenever theirs is attached, which is the clean way to add styling on top. From a module, `hook_library_info_alter(&$libraries, $extension)` mutates the parsed definitions programmatically (add a dependency, swap a file, bump the version). If the problem is that the library is attached at all on a given page, `hook_page_attachments_alter()` can remove it from `$attachments['#attached']['library']`. All of these are cached definitions, so rebuild caches after changing them.",
    },
  ],

  quiz: [
    {
      question:
        "The severity dashboard initializes on full page loads, but copies inserted by an AJAX pager stay dead. What's the most likely cause?",
      options: [
        "The library is missing a dependency on core/jquery",
        "The JS was wired with a DOMContentLoaded listener instead of Drupal.behaviors.attach()",
        "drupalSettings only populates on the first request",
        "The CSS was placed in the 'theme' category instead of 'component'",
      ],
      answerIndex: 1,
      explain:
        "DOMContentLoaded fires once per full page load, so markup inserted later by AJAX (or BigPipe, or a dialog) is never seen. Drupal re-runs every behavior's attach(context, settings) after each insertion with the new fragment as context — that's the contract, paired with once() to keep re-runs idempotent. jQuery is unrelated, drupalSettings is updated by AJAX responses, and CSS categories only affect ordering.",
    },
    {
      question:
        "What does once('incident-dashboard', '.incident-dashboard', context) return?",
      options: [
        "A jQuery object wrapping every matching element on the page",
        "true the first time it runs and false afterwards",
        "An array of plain DOM elements within context not yet processed under that id, which it marks as processed",
        "A Promise that resolves when the library has finished loading",
      ],
      answerIndex: 2,
      explain:
        "once() (from core/once — no jQuery involved) filters the selector matches inside context down to elements not already marked with data-once=\"incident-dashboard\", marks them, and returns them as an array of plain elements to iterate with forEach. That's what makes attach() safe to run repeatedly over overlapping DOM.",
    },
    {
      question:
        "You added severity-dashboard to incident_tracker.libraries.yml and cleared caches, but the CSS/JS never load. Why?",
      options: [
        "Libraries must also be registered in incident_tracker.info.yml",
        "Declaring a library loads nothing — it must be attached via '#attached' on a render array or hook_page_attachments()",
        "The js: entry requires { minified: true } before Drupal will serve it",
        "Custom modules can't define libraries; only themes can",
      ],
      answerIndex: 1,
      explain:
        "libraries.yml only declares the bundle. Assets reach the page when something attaches the library — '#attached' => ['library' => ['incident_tracker/severity-dashboard']] on the block/form/controller render array, or hook_page_attachments() for site-wide cases. There's no info.yml registration step for modules (a theme's info.yml libraries: key is a theme-only convenience), and both modules and themes can define libraries.",
    },
    {
      question:
        "Your dashboard JS reads drupalSettings.incidentTracker and it's undefined on some pages. Which explanation fits?",
      options: [
        "drupalSettings can only be set from hook_page_attachments(), never from a controller",
        "The key must be lower-case with underscores; camelCase keys are stripped",
        "On those pages nothing attached that drupalSettings payload — settings are per-render-array, and the library should also depend on core/drupalSettings",
        "drupalSettings is only available after the page's AJAX framework loads",
      ],
      answerIndex: 2,
      explain:
        "drupalSettings is assembled from the '#attached' arrays that actually rendered on that page and deep-merged into one JSON blob; a page whose render arrays never attached the incidentTracker payload simply has no such key. Declaring core/drupalSettings as a library dependency guarantees the settings JSON is present and ordered before your script. Key casing is irrelevant — camelCase is the convention — and any render array can contribute settings.",
    },
  ],
};

export default lesson;
