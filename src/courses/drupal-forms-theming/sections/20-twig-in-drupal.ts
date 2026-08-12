import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "twig-in-drupal",
  title: "Twig in Drupal: The Drupal-Specific Dialect",
  part: "The Theme Layer",
  estMinutes: 12,
  summary:
    "Drupal 10/11 run stock Twig 3, but add a render-array-aware vocabulary — attach_library(), |without, |t, create_attribute(), a replaced escape filter — and a composition model built on copy-and-override rather than {% extends %}.",

  concept: `
Drupal 10 and Drupal 11 both ship **stock Twig 3**. Nothing about the compiler,
\`{% for %}\`, \`{% if %}\` or \`{% macro %}\` is different from the Symfony you
already write. What is different is the extension layer:
\`Drupal\\Core\\Template\\TwigExtension\` registers roughly a dozen functions and
filters that exist because Drupal templates receive **render arrays**, not
strings, and because output is assembled by a renderer rather than by template
inheritance.

One thing *is* different at the engine level, and it is the single most common
"why does my method call fail?" gotcha for a Symfony developer: Drupal registers
Twig's \`SandboxExtension\` **globally**, with
\`Drupal\\Core\\Template\\TwigSandboxPolicy\`. Stock Symfony does not sandbox
application templates at all. Under the policy a method call on an object is
only allowed if the method name starts with \`get\`, \`has\` or \`is\`, or is one of
\`id\`, \`label\`, \`bundle\`, \`get\`, \`__toString\`, \`toString\` — or if the object is
an instance of an allow-listed class such as \`Drupal\\Core\\Template\\Attribute\`.
That is why \`{{ node.getCreatedTime }}\` works and \`{{ node.delete }}\` throws a
\`SecurityError\`. All three lists are overridable in \`settings.php\` via
\`twig_sandbox_allowed_prefixes\`, \`twig_sandbox_allowed_methods\` and
\`twig_sandbox_allowed_classes\`.

## The one idiom that pays for the whole section

A node template does not loop over fields. It gets \`content\`, a render array
keyed by field name, and prints slices of it:

\`\`\`
{{ content }}                             {# everything, in #weight order #}
{{ content.field_severity }}              {# just one field, label and all #}
{{ content|without('field_severity') }}   {# everything else — a COPY #}
\`\`\`

\`|without\` returns a copy with those keys removed, so the original array is
untouched and nothing is double-rendered. That three-line pattern — pull a field
out, place it somewhere special, dump the rest — is how ninety percent of real
Drupal templates are written. It also accepts an array of keys —
\`content|without(['field_a', 'field_b'])\` — as well as a variadic list, and has
since Drupal 8.9/9.0.

Printing a render array works because Drupal **replaces Twig's \`escape\`
filter** (historically \`twig_drupal_escape_filter\`). Its version checks the
value first: arrays go through \`renderer->render()\`, objects implementing
\`MarkupInterface\` (\`TranslatableMarkup\`, \`Markup::create()\`, \`FormattableMarkup\`)
print verbatim because they are already sanitized, and everything else is
\`htmlspecialchars\`-escaped. So auto-escaping is on and you almost never write
\`|raw\`.

## Functions you will not find in Symfony

* \`attach_library('incident_tracker/card-behaviour')\` — the template declares its
  own CSS/JS; internally it renders \`['#attached' => ['library' => [...]]]\`.
* \`path()\` and \`url()\` — same names as Symfony, signature
  \`(route, parameters, options)\`.
* \`link(title, url, attributes)\` — a function, not a filter.
* \`create_attribute({'class': ['card']})\` — builds an \`Attribute\` object so a
  variable you invented behaves like \`attributes\`.
* \`file_url(uri)\`, \`render_var(array)\`, \`active_theme()\`, \`active_theme_path()\`.

## Filters you will not find in Symfony

\`|t\` (alias \`|trans\`) with \`@placeholder\` / \`%emphasised\` / \`:url\` arguments,
\`|placeholder\`, \`|clean_class\` and \`|clean_id\` (\`Html::getClass\`/\`getId\`),
\`|safe_join(', ')\`, \`|without\`, \`|render\`, \`|format_date('short')\`. Drupal 10.1+
adds \`|add_class\` and \`|set_attribute\` for chaining onto an \`Attribute\` object,
and \`|add_suggestion\` has been there since 10.0.

## Attributes, and why you copy instead of extend

Every themable template is handed \`attributes\`, and node/field templates also get
\`title_attributes\` and \`content_attributes\`. Print them **inside** the tag —
\`<article{{ attributes.addClass('incident') }}>\` — never as \`class="{{ attributes.class }}"\`.

Finally: core templates contain almost no \`{% block %}\` tags, so
\`{% extends '@olivero/content/node.html.twig' %}\` resolves perfectly well and
still buys you nothing — you inherit the whole file and have nothing to
override. The **un-namespaced** form is the dangerous one:
\`{% extends 'node.html.twig' %}\` is resolved through Drupal's theme-registry
loader, which points it back at *this* file, and Twig recurses until PHP dies.
The Drupal composition model is: copy the core template into
\`incident_theme/templates/\`, rename it to a suggestion such as
\`node--incident--teaser.html.twig\`, and edit. Inheritance is replaced by the
theme registry.
`,

  comparisons: [
    {
      label: "Rendering an entity's fields",
      intro:
        "A Symfony template iterates a DTO or entity and writes every tag itself. A Drupal template receives an already-built render array and mostly decides where each slice lands.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# templates/incident/show.html.twig — Symfony 6.4/7 #}
{% extends 'base.html.twig' %}

{% block title %}{{ incident.title }}{% endblock %}

{% block body %}
  <article class="incident incident--{{ incident.severity|lower }}">
    <h1>{{ incident.title }}</h1>

    <p class="incident__severity">{{ incident.severity }}</p>

    {# You know every field, so you list every field. #}
    <div class="incident__body">{{ incident.body|raw }}</div>

    <ul class="incident__tags">
      {% for tag in incident.tags %}
        <li>{{ tag.name }}</li>
      {% endfor %}
    </ul>
  </article>
{% endblock %}`,
      ts: `{# incident_theme/templates/node--incident--full.html.twig — Drupal 10/11 #}
{{ attach_library('incident_tracker/card-behaviour') }}

<article{{ attributes.addClass('incident', 'incident--' ~ node.bundle|clean_class) }}>

  {{ title_prefix }}
  <h1{{ title_attributes }}>{{ label }}</h1>
  {{ title_suffix }}

  {# Pull two fields out and place them deliberately. #}
  <p class="incident__severity">{{ content.field_severity }}</p>
  <p class="incident__opened">{{ node.getCreatedTime|format_date('short') }}</p>

  {# Then dump everything you did NOT hand-place. |without returns a copy,
     so field_severity is not rendered twice. #}
  <div{{ content_attributes.addClass('incident__body') }}>
    {{ content|without('field_severity', 'links') }}
  </div>

  {{ content.links }}
</article>`,
      note: "content|without(...) is the single most useful Drupal Twig idiom: it lets you hand-place a few fields without losing the ones a site builder adds later in Manage Display.",
    },
    {
      label: "Attaching CSS and JS from the template",
      intro:
        "Symfony resolves asset bundles at build time and you print link/script tags. Drupal collects library names into the render array and the renderer deduplicates and orders them for the whole page.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# Symfony with WebpackEncoreBundle #}
{% block stylesheets %}
  {{ parent() }}
  {{ encore_entry_link_tags('incident') }}
{% endblock %}

{% block javascripts %}
  {{ parent() }}
  {{ encore_entry_script_tags('incident') }}
{% endblock %}

{# …or with AssetMapper (Symfony 6.3+), in the base template only: #}
{{ importmap('app') }}

{# Either way the tags are emitted where you print them, and it is on you
   to avoid emitting the same bundle twice from two templates. #}`,
      ts: `{# incident_theme/templates/node--incident--teaser.html.twig #}
{# Prints nothing. It renders ['#attached' => ['library' => [...]]] as a
   side effect, and the renderer bubbles it to the page. #}
{{ attach_library('incident_tracker/card-behaviour') }}

{# Safe to call from ten templates on one page: assets are deduplicated,
   dependency-ordered, and aggregated. #}

<article{{ attributes.addClass('incident-card') }}>
  <h2{{ title_attributes }}>{{ label }}</h2>
  {{ content|without('links') }}
</article>

{# The card's BEHAVIOUR belongs to the module that builds the card:

   incident_tracker.libraries.yml
   card-behaviour:
     version: 1.x
     css:
       component:
         css/incident-card.css: {}
     js:
       js/incident-card.js: {}
     dependencies:
       - core/drupal
       - core/once

   The theme only adds the SKIN, and wires it on from incident_theme.info.yml
   with  libraries-extend:  incident_tracker/card-behaviour: [incident_theme/card-skin]

   incident_theme.libraries.yml
   card-skin:
     version: 1.x
     css:
       theme:
         css/incident-card.skin.css: {}
#}`,
      note: "attach_library() is for conditional, template-local assets. Site-wide assets belong in the theme's *.info.yml libraries: key; render-array-local assets belong in #attached.",
    },
    {
      label: "Translating interface text",
      intro:
        "Both frameworks refuse to let you concatenate translated strings. Drupal's placeholder prefixes also decide the escaping strategy, which Symfony's do not.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# Symfony: the |trans filter. The {% transchoice %} tag and filter were
   removed in 5.0 — use |trans with a %count% parameter and ICU instead.
   The {% trans %} TAG still exists, but the filter is the idiomatic form. #}
<h2>{{ 'incident.open_count'|trans({'%count%': total}) }}</h2>

<p>{{ 'incident.assigned_to'|trans({'%name%': user.name}, 'messages') }}</p>

{# Pluralisation is ICU message format inside the catalogue file:
   incident.open_count: '{count, plural, =0 {No incidents} one {One incident}
                          other {# incidents}}'  #}

{# Escaping of the placeholder is Twig's normal autoescape. #}`,
      ts: `{# Drupal: |t (alias |trans). Placeholder PREFIX picks the sanitiser. #}
<h2>{{ 'Open incidents'|t }}</h2>

{# @  -> escaped plain text
   %  -> escaped AND wrapped in <em class="placeholder">
   :  -> run through UrlHelper::stripDangerousProtocols(), for href="" #}
<p>{{ 'Assigned to @name on %date'|t({'@name': user.name, '%date': posted}) }}</p>

{# :url must sit inside the quoted format string — translating a bare ':url'
   would put a meaningless string in the translation catalogue. #}
{{ '<a href=":url">Runbook</a>'|t({':url': help_url}) }}

{# {% trans %} is a real tag in Drupal. Bare {{ vars }} inside it become
   @placeholders automatically; pipe through |placeholder for the % form. #}
{% trans %}
  Incident {{ id|placeholder }} was opened by {{ author }}.
{% endtrans %}

{% trans %}
  1 incident is open.
{% plural open_count %}
  @count incidents are open.
{% endtrans %}

{# Disambiguate identical source strings with a context: #}
{% trans with {'context': 'Incident status'} %}Open{% endtrans %}`,
      note: "Only literal strings are extractable — {{ some_var|t }} is a bug, because the translation extractor never sees the source text and it will not be in the .po file.",
    },
    {
      label: "Composition: extends/blocks vs copy-and-override",
      intro:
        "Symfony composes templates with inheritance. Drupal composes them with the theme registry: a suggestion list picks the file, and preprocess supplies the variables.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# Symfony: an explicit inheritance chain you control. #}

{# base.html.twig #}
<body>{% block body %}{% endblock %}</body>

{# incident/_card.html.twig #}
{% block card %}
  <article class="card">
    <h2>{% block card_title %}{{ incident.title }}{% endblock %}</h2>
    {% block card_body %}{{ incident.summary }}{% endblock %}
  </article>
{% endblock %}

{# incident/_card_urgent.html.twig #}
{% extends 'incident/_card.html.twig' %}
{% block card_title %}
  🔥 {{ parent() }}
{% endblock %}

{# The controller names the template: render('incident/_card_urgent.html.twig') #}`,
      ts: `{# Drupal: nobody names a template. hook_theme() + theme suggestions do.
   Suggestions are collected in ascending specificity — least specific first:
     node  ->  node--teaser  ->  node--incident  ->  node--incident--teaser
     ->  node--42--teaser
   and the theme system reverses the list, taking the last suggestion that has
   a registered template. Position in the list decides, not the length of the
   name, so a suggestion appended late by a theme beats a longer name added
   earlier by a module.

   Which FILE that name resolves to is the registry's job: the highest layer
   that supplies that filename wins — the active theme beats its base themes,
   and any theme beats a module. The registry is built modules first, then base
   themes most-distant-first, then the active theme, and later layers replace
   earlier ones. #}

{# incident_theme/templates/node--incident--teaser.html.twig
   = a COPY of core's node.html.twig, edited. No {% extends %}. #}
<article{{ attributes.addClass('incident-card') }}>
  <h2{{ title_attributes }}>{{ label }}</h2>
  {{ content|without('links') }}
</article>

{# The namespaced form resolves fine — straight to Olivero's real file — but
   core templates define almost no blocks, so you inherit the whole file and
   gain nothing:
   {% extends '@olivero/content/node.html.twig' %}  ← pointless

   The un-namespaced form is worse: it goes through the theme registry,
   resolves back to THIS file, and recurses until PHP dies:
   {% extends 'node.html.twig' %}  ← don't #}

{# {% include %} and {% embed %} ARE fine for your own partials: #}
{% include '@incident_theme/partials/severity-badge.html.twig'
   with {'severity': content.field_severity} only %}

{# Drupal 10.3+/11 (SDC was experimental in 10.1–10.2, stable in 10.3):
   prefer a Single-Directory Component for reusable UI. #}
{{ include('incident_theme:severity-badge', {severity: severity}, with_context = false) }}`,
      note: "Rule of thumb: {% extends %} only your own theme's templates; copy-and-override core's. Reuse across templates goes through {% include %}/{% embed %} or, in Drupal 10.3+ (SDC was experimental in 10.1–10.2, stable in 10.3), an SDC.",
    },
  ],

  playground: {
    intro:
      "A pocket-sized version of Drupal's Twig extension in pure PHP: children sorted by #weight, the replaced escape filter letting MarkupInterface through while escaping raw strings, |without returning a copy, and |clean_class. Predict all four blocks of output before you run it.",
    lang: "php",
    code: `<?php
// A pocket-sized version of what Drupal's Twig extension does when a template
// prints {{ content }}, {{ content.field_body }} and {{ content|without(...) }}.

/** Anything implementing this is already safe: the escape filter lets it pass. */
interface MarkupInterface extends Stringable {}

final class Markup implements MarkupInterface {
  public function __construct(private string $html) {}
  public function __toString(): string { return $this->html; }
}

/** Html::getClass() — what the |clean_class filter does to a string. */
function clean_class(string $value): string {
  $value = strtr(strtolower($value), [' ' => '-', '_' => '-', '/' => '-', '[' => '-', ']' => '']);
  return preg_replace('/[^a-z0-9\\-]/', '', $value);
}

/** Drupal's replacement for Twig's |escape (aka twig_drupal_escape_filter). */
function drupal_escape(mixed $value): string {
  if ($value instanceof MarkupInterface) {
    return (string) $value;          // already safe -> printed verbatim
  }
  if (is_array($value)) {
    return render_var($value);       // a render array -> render it first
  }
  return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Element::children() + sort by #weight (ties keep insertion order). */
function children(array $build): array {
  $kids = [];
  $i = 0;
  foreach ($build as $key => $value) {
    if ($key[0] !== '#') {
      $kids[$key] = [$value['#weight'] ?? 0, $i++];
    }
  }
  uasort($kids, fn($a, $b) => $a <=> $b);
  return array_keys($kids);
}

/** render_var() / the |render filter: turn a render array into safe markup. */
function render_var(array $build): string {
  $out = '';
  if (($build['#theme'] ?? '') === 'field') {
    $items = implode('', array_map(
      fn($item) => '<div class="field__item">' . drupal_escape($item) . '</div>',
      $build['#items'],
    ));
    $class = 'field field--name-' . clean_class($build['#field_name']);
    $out .= '<div class="' . $class . '">' . $items . "</div>\\n";
  }
  foreach (children($build) as $key) {
    $out .= render_var($build[$key]);
  }
  return ($build['#prefix'] ?? '') . $out . ($build['#suffix'] ?? '');
}

/** The |without filter: a COPY minus those keys; the original is untouched. */
function without(array $build, string ...$keys): array {
  foreach ($keys as $key) {
    unset($build[$key]);
  }
  return $build;
}

// What node preprocess hands the template as $variables['content'].
$content = [
  'field_body' => [
    '#theme' => 'field', '#field_name' => 'field_body', '#weight' => 0,
    '#items' => ['Pager exhausted at 02:14 UTC.'],
  ],
  'field_severity' => [
    '#theme' => 'field', '#field_name' => 'field_severity', '#weight' => -5,
    '#items' => ['SEV-1'],
  ],
  'field_summary' => [
    '#theme' => 'field', '#field_name' => 'field_summary', '#weight' => -10,
    // A MarkupInterface value: trusted, so |escape leaves the tags alone.
    '#items' => [new Markup('<strong>Checkout</strong> down')],
  ],
  'links' => [
    '#theme' => 'field', '#field_name' => 'links', '#weight' => 10,
    // A plain string: escaped on the way out, no matter where it came from.
    '#items' => ['<script>alert(1)</script>'],
  ],
];

echo "{{ content }}\\n" . render_var($content) . "\\n";
echo "{{ content.field_body }}\\n" . render_var($content['field_body']) . "\\n";
echo "{{ content|without('field_body', 'links') }}\\n"
  . render_var(without($content, 'field_body', 'links')) . "\\n";
echo "original untouched: " . implode(', ', array_keys($content)) . "\\n\\n";

foreach (['Incident Report', 'view_mode/Teaser', 'SEV-1 (P0)'] as $raw) {
  printf("%-18s |clean_class -> %s\\n", $raw, clean_class($raw));
}
`,
    output: `{{ content }}
<div class="field field--name-field-summary"><div class="field__item"><strong>Checkout</strong> down</div></div>
<div class="field field--name-field-severity"><div class="field__item">SEV-1</div></div>
<div class="field field--name-field-body"><div class="field__item">Pager exhausted at 02:14 UTC.</div></div>
<div class="field field--name-links"><div class="field__item">&lt;script&gt;alert(1)&lt;/script&gt;</div></div>

{{ content.field_body }}
<div class="field field--name-field-body"><div class="field__item">Pager exhausted at 02:14 UTC.</div></div>

{{ content|without('field_body', 'links') }}
<div class="field field--name-field-summary"><div class="field__item"><strong>Checkout</strong> down</div></div>
<div class="field field--name-field-severity"><div class="field__item">SEV-1</div></div>

original untouched: field_body, field_severity, field_summary, links

Incident Report    |clean_class -> incident-report
view_mode/Teaser   |clean_class -> view-mode-teaser
SEV-1 (P0)         |clean_class -> sev-1-p0
`,
  },

  keyPoints: [
    "Drupal 10/11 run unmodified Twig 3; the dialect is the extension layer — Drupal\\Core\\Template\\TwigExtension — added because templates receive render arrays, not strings.",
    "{{ content }} renders everything in #weight order, {{ content.field_x }} renders one field, and {{ content|without('field_x') }} renders a COPY without it — hand-place a few fields, dump the rest.",
    "Drupal replaces Twig's escape filter: render arrays are rendered, MarkupInterface objects (TranslatableMarkup, Markup::create) print verbatim, everything else is htmlspecialchars-escaped — so |raw is almost always wrong.",
    "Drupal-only functions: attach_library(), path()/url()/link(), create_attribute(), file_url(), render_var(), active_theme(). Drupal-only filters: |t / |trans, |placeholder, |clean_class, |clean_id, |safe_join, |without, |render, |format_date (plus |add_class and |set_attribute in 10.1+).",
    "|t and {% trans %} only work on LITERAL strings; @ escapes, % escapes and emphasises, : sanitises a URL. {% trans %}…{% plural n %}…{% endtrans %} handles plurals with @count.",
    "Print attributes inside the tag — <article{{ attributes.addClass('incident') }}>, plus title_attributes/content_attributes — and compose by copy-and-override with theme suggestions, never {% extends %} of a core template (no blocks to override, and the un-namespaced {% extends 'node.html.twig' %} resolves back through the theme registry to your own file and recurses).",
  ],

  interview: [
    {
      q: "In a node template you need the body field rendered inside a special wrapper, but you must not break fields that a site builder adds in Manage Display later. How do you write it?",
      a: "Hand-place the one field and dump the remainder with `|without`:\n\n```twig\n<div class=\"incident__lead\">{{ content.field_body }}</div>\n<div class=\"incident__rest\">{{ content|without('field_body') }}</div>\n```\n\nThe key property is that `|without` returns a *copy* of the render array with that key removed, so `field_body` is not rendered twice and the original `content` variable is unchanged. The alternative approaches are both worse: unsetting the field in `hook_preprocess_node()` mutates shared state, and listing every field explicitly means any field added later silently disappears from the page. Site builders expect Manage Display to keep working, and `|without` is what preserves that contract.",
    },
    {
      q: "Coming from Symfony, why can't you just {% extends %} a core Drupal template from your theme and override a block?",
      a: "Two reasons. First, core's templates contain almost no `{% block %}` tags — they are flat markup — so there is nothing to override; you would inherit the whole file and gain nothing. Second, Drupal resolves a template by *name* through the theme registry and the suggestion list, so `{% extends 'node.html.twig' %}` from a file your theme registered as `node.html.twig` resolves back to itself and recurses until PHP dies. The Drupal model is: copy the core template into `incident_theme/templates/`, rename it to the most specific suggestion you need (`node--incident--teaser.html.twig`), and edit it. `{% extends %}` and `{% embed %}` are still fine *within* your own theme's templates, and Single-Directory Components — experimental in 10.1–10.2, stable from 10.3 — give you a proper reusable-component boundary.",
    },
    {
      q: "Explain Drupal's auto-escaping. When would you legitimately reach for |raw?",
      a: "Twig 3's autoescape is on, but Drupal swaps in its own `escape` implementation. It inspects the value: an array is passed to the renderer and rendered; an object implementing `MarkupInterface` — `TranslatableMarkup` from `t()`, `FormattableMarkup`, anything from `Markup::create()` — is trusted and printed verbatim because it was sanitised when it was created; anything else is run through `htmlspecialchars()`. That means processed text (a body field that has already been through a text format's filters) arrives as `Markup` and renders correctly with no `|raw` at all. Legitimate `|raw` is close to nonexistent in Drupal — if you find yourself typing it, the real fix is usually to build a render array, use `Markup::create()` on already-sanitised markup, or run the string through `check_markup()`. `|raw` on anything derived from user input is a stored-XSS bug.",
    },
    {
      q: "What does attach_library() actually do, and when is it the wrong tool?",
      a: "It is a Twig function that renders a throwaway render array of the form `['#attached' => ['library' => ['incident_tracker/card-behaviour']]]`. It prints nothing; the effect is that the library bubbles up through the render pipeline into the page's `#attached`, where `HtmlResponseAttachmentsProcessor` resolves dependencies, deduplicates, orders and aggregates the assets. So calling it from ten teaser templates on one listing page is safe and correct. It is the wrong tool for assets every page needs — those go in the theme's `*.info.yml` under `libraries:` — and for assets tied to a specific render array built in PHP, where `$build['#attached']['library'][] = '...'` is more testable and keeps the template dumb. It is also useless in a template that Drupal caches and then serves from the render cache without executing… which is not actually a problem, because `#attached` is part of the cached render context and is replayed.",
    },
  ],

  quiz: [
    {
      question:
        "A template does `{{ content.field_severity }}` at the top and `{{ content }}` at the bottom. What happens?",
      options: [
        "Only the severity field renders; printing content afterwards is a no-op.",
        "The severity field is rendered twice — once alone and once inside content.",
        "Twig throws 'field already rendered'.",
        "Drupal automatically removes already-printed children from content.",
      ],
      answerIndex: 1,
      explain:
        "Printing a child does not remove it from the parent array, so the field appears twice. The fix is `{{ content|without('field_severity') }}` at the bottom, which renders a copy of the array with that key removed while leaving the original intact.",
    },
    {
      question:
        "Which of these will actually end up in the theme's .po translation file?",
      options: [
        "{{ label|t }}",
        "{{ 'Open incidents'|t }}",
        "{{ ('Open ' ~ type)|t }}",
        "{{ node.title.value|trans }}",
      ],
      answerIndex: 1,
      explain:
        "The translation extractor is a static parser: it can only find literal strings passed to t()/|t/{% trans %}. Piping a variable or a concatenation through |t produces no extractable source string, so nothing lands in the .po file, and at runtime you get an untranslated (and possibly user-controlled) source string.",
    },
    {
      question:
        "Which placeholder prefix in `{{ 'Assigned to X'|t({...}) }}` escapes the value AND wraps it in <em class=\"placeholder\">?",
      options: ["@name", "%name", ":name", "!name"],
      answerIndex: 1,
      explain:
        "`@` escapes plain text, `%` escapes and then applies Drupal's placeholder formatting (an <em class=\"placeholder\"> wrapper, the same thing the |placeholder filter does), and `:` sanitises a value destined for an href with UrlHelper::stripDangerousProtocols(). The unsanitised `!` prefix was removed in Drupal 8.",
    },
    {
      question:
        "Where should `{{ attributes }}` be printed in a Drupal template?",
      options: [
        "As a class value: <article class=\"{{ attributes.class }}\">",
        "Immediately after the tag name, inside the tag: <article{{ attributes }}>",
        "Anywhere in the template; Drupal moves it to the wrapper element.",
        "Only in page.html.twig — other templates use create_attribute() instead.",
      ],
      answerIndex: 1,
      explain:
        "`attributes` is an Attribute object whose __toString() renders the whole attribute string, including classes, id, data-* and anything preprocess or a contrib module added. Printing it inside the opening tag (with no space — the object supplies its own leading space) is the only form that preserves all of them; reading `.class` throws the rest away.",
    },
  ],
};

export default lesson;
