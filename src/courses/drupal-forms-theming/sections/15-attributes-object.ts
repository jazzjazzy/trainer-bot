import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "attributes-object",
  title: "The Attributes Object & Safe Markup",
  part: "Render Arrays & the Render Pipeline",
  estMinutes: 13,
  summary:
    "Why Drupal wraps HTML attributes in an object instead of a string, and the escaping ladder — Html::escape, Xss::filter, Xss::filterAdmin, Markup::create — that decides whether your theme has an XSS hole.",

  concept: `
Drupal runs the same Twig 3 engine you use in Symfony, with the same
\`autoescape: html\` default. Two things are bolted on top, and both exist for
the same reason: **many modules contribute to one piece of HTML**, so neither
the attributes nor the trust level of a string can be a plain PHP string.

## Everything printed is escaped — unless it is Markup

Drupal's Twig escaper short-circuits on one condition: the value implements
\`Drupal\\Component\\Render\\MarkupInterface\`. If it does, it is printed verbatim;
if it does not, it goes through \`Html::escape()\`. Trust is carried by the
**type**, not by a flag you pass or a filter you remember. That is why
\`\\Drupal\\Core\\Render\\Markup::create()\` is the whole security boundary of the
theme layer, and why calling it on anything a user typed is the classic Drupal
XSS bug. Pick the weakest tool that works:

- \`Html::escape(\$text)\` — plain text. No HTML survives. This is what
  \`'#plain_text'\` does for you.
- \`Xss::filter(\$html)\` — user-submitted rich text. Tiny allow-list:
  \`a, em, strong, cite, blockquote, code, ul, ol, li, dl, dt, dd\`.
- \`Xss::filterAdmin(\$html)\` — content from a trusted admin. Everything except
  \`script\`, \`style\`, \`iframe\`, \`form\`, \`input\`… This is what \`'#markup'\`
  silently runs through, which is why \`#markup\` quietly eats your \`<form>\`.
- \`Markup::create(\$html)\` — "I built this string myself and it is safe."

In review, \`|raw\` and \`Markup::create()\` are the two things to grep for. \`|raw\`
on a variable that came from a field, a query string or config is a finding, not
a style nit.

## The Attribute object

\`Drupal\\Core\\Template\\Attribute\` is an \`ArrayAccess\` collection that knows how
to print itself — **with a leading space**, so you write \`<div{{ attributes }}>\`,
never \`<div {{ attributes }}>\`. Every preprocess function and every module's
\`hook_preprocess_HOOK()\` can mutate the same object before it renders:

\`\`\`
{{ attributes.addClass('incident', severity|clean_class) }}
{{ attributes.removeClass('is-draft').setAttribute('data-id', incident.id) }}
{% if attributes.hasClass('is-open') %}…{% endif %}
{{ attributes.without('class') }}   {# a COPY, minus one key #}
{% set inner = create_attribute({'class': ['incident__body']}) %}
\`\`\`

Methods are chainable because they return \`\$this\` — and \`Attribute\` has
\`__toString()\`, so \`{{ attributes.addClass('x') }}\` both mutates *and* prints the
entire set. That is usually what you want inside a tag, and a nasty surprise
anywhere else. \`without()\` returns a clone, so the original is untouched —
that is the idiom for splitting one attribute set across a wrapper and an inner
element.

\`clean_class\` and \`clean_id\` are filters (\`Html::getClass()\` /
\`Html::getId()\`) — always run interpolated values through them rather than
trusting a taxonomy term name to be a legal CSS identifier.

## The three sigils

\`t()\` / \`\$this->t()\` returns \`TranslatableMarkup\`, so it is safe to print. Its
placeholders decide escaping:

- \`@name\` — escaped (passed through if already \`MarkupInterface\`).
- \`%name\` — escaped, then wrapped in \`<em class="placeholder">\`.
- \`:name\` — for a URL inside \`href=":name"\`; dangerous protocols stripped, then
  escaped. It must sit inside quotes in the format string.

Symfony's \`trans()\` has \`%name%\` too, but it is a naming convention with no
escaping semantics. In Drupal the sigil *is* the security policy. Never
concatenate into \`t()\` — \`t('Hello ' . \$name)\` breaks translation and escaping
at once.
`,

  comparisons: [
    {
      label: "Building the wrapper element's attributes",
      intro:
        "A Symfony template owns its markup outright, so a class list is string concatenation. A Drupal template is a shared surface — core, contrib and your theme all get to touch the same attribute set, so it arrives as an object.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# templates/incident/_card.html.twig — you own this markup end to end. #}
{% set classes = ['incident', 'incident--' ~ incident.severity|lower] %}
{% if incident.isOpen %}
  {% set classes = classes|merge(['is-open']) %}
{% endif %}

<article class="{{ classes|join(' ') }}"
         id="incident-{{ incident.id }}"
         data-severity="{{ incident.severity }}">
  <h2>{{ incident.title }}</h2>
  {# Nothing outside this file can add a class here. A bundle that wants to
     decorate the card has to override the whole template. #}
</article>`,
      ts: `{# incident_theme/templates/node--incident.html.twig #}
{#
  'attributes' is a Drupal\\Core\\Template\\Attribute object. Core put an id and
  classes in it, Quick Edit / Layout Builder / contrib added data-* keys, and
  your preprocess added more. You print the whole set.
  It renders WITH a leading space — so no space before {{ attributes }}.
#}
{% set classes = [
  'incident',
  'incident--' ~ severity|clean_class,
  is_open ? 'is-open',
] %}

<article{{ attributes.addClass(classes).setAttribute('data-incident-id', node.id) }}>

  {# create_attribute() when you need a fresh set for a child element. Do NOT
     reuse the names attributes / title_attributes / content_attributes: those
     three are the variables the theme manager converts into Attribute objects
     for you, and a node template receives them already populated. #}
  {% set body_attributes = create_attribute({'class': ['incident__body']}) %}
  <div{{ body_attributes }}>

    {# title_attributes already exists — add to it, never reassign it. #}
    <h2{{ title_attributes.addClass('incident__title').setAttribute('id', label|clean_id) }}>{{ label }}</h2>

    {% if attributes.hasClass('is-open') %}
      <span class="incident__badge">{{ 'Open'|t }}</span>
    {% endif %}
  </div>
</article>

{# without() returns a CLONE minus one key — that is how you SPLIT one set
   across two elements: print the reduced clone on one, the removed key on the
   other. Never print the whole set on a wrapper AND a without() copy on a
   child; every non-class key (id, lang, dir, data-drupal-selector, contextual
   link data-*) would be emitted twice — invalid HTML, duplicate JS hooks:
     <article{{ attributes.without('class') }}>
       <div class="{{ classes|join(' ') }}">…</div>
     </article> #}`,
      note: "addClass/removeClass/setAttribute return $this and Attribute has __toString(), so chaining prints the whole set. without() returns a CLONE — the only non-mutating method of the group. attributes, title_attributes and content_attributes are the three reserved variables Drupal auto-converts into Attribute objects: add to them, never {% set %} over them.",
    },
    {
      label: "Handing attributes to the template from PHP",
      intro:
        "Symfony passes whatever you like into render(). Drupal expects attribute-shaped variables to already be Attribute objects by the time Twig sees them — the render system converts #attributes for you, preprocess has to do it by hand.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony: the controller decides the shape; the template does the rest.
final class IncidentController extends AbstractController
{
    public function show(Incident $incident): Response
    {
        return $this->render('incident/show.html.twig', [
            'incident' => $incident,
            // Just data. Escaping happens when Twig prints it.
            'card_classes' => ['incident', 'incident--' . $incident->getSeverity()],
            'card_id' => 'incident-' . $incident->getId(),
        ]);
    }
}

// Anything else that wants to add a class must either be passed in here,
// or override the template. There is no shared mutable attribute bag.`,
      ts: `use Drupal\\Core\\Template\\Attribute;
use Drupal\\Component\\Utility\\Html;

// incident_theme.theme — every module gets a turn at the same object.
function incident_theme_preprocess_node__incident(array &$variables): void {
  /** @var \\Drupal\\node\\NodeInterface $node */
  $node = $variables['node'];
  $severity = $node->get('field_severity')->value ?? 'unknown';

  // Inside preprocess this is still a plain array — the theme system only
  // converts attributes/title_attributes/content_attributes into Attribute
  // objects after the whole chain runs.
  $variables['attributes']['class'][] = 'incident--' . Html::getClass($severity);
  $variables['attributes']['data-incident-id'] = $node->id();

  // A variable YOU invent is a plain array until you wrap it. Twig can call
  // .addClass() only on an object, so wrap it in preprocess, not in the template.
  $variables['badge_attributes'] = new Attribute([
    'class' => ['incident__badge'],
    'id' => Html::getUniqueId('incident-badge'),
  ]);
}

// In a render array you pass a plain array: the theme system merges
// '#attributes' into $variables['attributes'], and the theme manager converts
// exactly three variables — attributes, title_attributes, content_attributes —
// into Attribute objects before the template runs (ThemeManager::render(); the
// old template_preprocess() helper is deprecated in 11.2, removed in 12):
$build['card'] = [
  '#type' => 'container',
  '#attributes' => ['class' => ['incident-card'], 'data-severity' => $severity],
];`,
      note: "Html::getClass() / Html::getId() are the PHP twins of |clean_class / |clean_id. Html::getUniqueId() additionally guarantees uniqueness per request — use it for anything JavaScript will query.",
    },
    {
      label: "Letting HTML through on purpose",
      intro:
        "Both engines autoescape, and both give you an escape hatch. Symfony's hatch is a filter you apply at print time; Drupal's is a type you attach at build time — which means the decision is auditable in PHP rather than buried in a template.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony: one hatch, |raw, applied in the template.
{# incident/show.html.twig #}
{{ incident.body }}          {# escaped #}
{{ incident.body|raw }}      {# NOT escaped — you own the consequences #}

// Sanitising is your own choice of library, wired up by hand:
use HtmlSanitizer\\SanitizerInterface;

final class BodyRenderer
{
    public function __construct(private SanitizerInterface $sanitizer) {}

    public function safe(string $html): string
    {
        // Returns a plain string. Nothing downstream can tell it was cleaned,
        // so the template still needs |raw and still looks alarming in review.
        return $this->sanitizer->sanitize($html);
    }
}`,
      ts: `use Drupal\\Component\\Utility\\Html;
use Drupal\\Component\\Utility\\Xss;
use Drupal\\Core\\Render\\Markup;

// Weakest tool that does the job — top to bottom, least to most trusting.
$plain  = Html::escape($user_input);            // no HTML survives at all
$rich   = Xss::filter($user_input);             // a, em, strong, cite, code, ul/ol/li…
$admin  = Xss::filterAdmin($config_snippet);    // all but script/style/iframe/form/input
$unsafe = Markup::create($html_i_built_myself); // <- an assertion, not a check

// In a render array, prefer the element that encodes the policy:
$build['title'] = ['#plain_text' => $user_input];              // Html::escape
$build['teaser'] = [
  '#type' => 'processed_text',                                 // runs a text format
  '#text' => $node->get('body')->value,
  '#format' => $node->get('body')->format,
];
$build['note'] = ['#markup' => '<p>Escalated</p>'];            // Xss::filterAdmin!

// THE classic hole. Never do this with anything a user can influence:
// $build['x'] = ['#markup' => Markup::create($request->query->get('q'))];
// Markup::create() disables escaping for the rest of the request.`,
      note: "'#markup' is not raw output: the renderer pushes it through Xss::filterAdmin() unless it is already MarkupInterface. That is why a <form> or <script> in #markup vanishes, and why #markup is not a safe home for arbitrary HTML.",
    },
    {
      label: "Interpolating into a translated string",
      intro:
        "Both frameworks interpolate into translatable strings. Symfony's parameter names are a convention; Drupal's leading character is a security policy the interpolator actually reads.",
      leftLang: "php",
      rightLang: "php",
      php: `use Symfony\\Contracts\\Translation\\TranslatorInterface;

// %name% is just a naming convention — no escaping is implied.
$message = $translator->trans('incident.reported', [
    '%title%' => $incident->getTitle(),
    '%user%'  => $user->getUserIdentifier(),
]);

// If the result is printed with |raw (common for messages containing links),
// the burden of escaping is entirely on you:
$message = $translator->trans('incident.view_link', [
    '%url%' => $this->generateUrl('app_incident_show', ['id' => $id]),
]);

{# show.html.twig #}
{{ message }}          {# escaped: the <a> in the catalogue shows as text #}
{{ message|raw }}      {# renders the <a> — and any HTML in the title too #}`,
      ts: `// Three sigils, three escaping rules. Memorise these.
$this->t('Incident @title was reported by @user.', [
  '@title' => $node->label(),        // Html::escape'd (passed through if Markup)
  '@user'  => $account->getDisplayName(),
]);

$this->t('Deleted %title.', [
  '%title' => $node->label(),        // escaped, then wrapped: <em class="placeholder">
]);

$this->t('<a href=":url">View incident</a>', [
  ':url' => $node->toUrl()->toString(),   // stripDangerousProtocols + escape
]);                                       // MUST be inside quotes in the format

// Context and plurals, since you will be asked:
$this->t('Open', [], ['context' => 'Incident status']);
$this->formatPlural($count, '1 incident', '@count incidents');  // @count is implicit

// The result is TranslatableMarkup (a MarkupInterface), so Twig prints it
// unescaped — the placeholders were already escaped individually.
$build['msg'] = ['#markup' => $this->t('Incident %t closed.', ['%t' => $label])];

// Anti-patterns an interviewer will look for:
// $this->t('Hello ' . $name)            <- unextractable, unescaped
// $this->t($config->get('label'))       <- dynamic string, never translated
// $this->t('@x', ['@x' => Markup::create($user_input)])  <- bypasses the escape`,
      note: "A raw variable as the whole t() argument is the single most common review reject: t() runs its argument through the translation catalogue, so it must be a literal string with placeholders.",
    },
  ],

  playground: {
    intro:
      "A pocket-sized Attribute object, Twig's autoescape rule, and the three t() sigils — in plain PHP, no Drupal. Read it and predict every line of output before you run it. Pay attention to what happens to the <script> tag on each of the last three lines, and to the javascript: URL at the very end.",
    lang: "php",
    code: `<?php
// A miniature Attribute object + Twig autoescape + t() sigils, no Drupal.

/** Anything implementing this is "already safe" and is printed verbatim. */
interface SafeString {}

/** Drupal\\Core\\Render\\Markup — the escape hatch. Trust is a TYPE, not a flag. */
final class Markup implements SafeString {
  private function __construct(private string $string) {}
  public static function create(string $string): self { return new self($string); }
  public function __toString(): string { return $this->string; }
}

/** Html::escape() */
function escape(string $text): string {
  return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** What Twig does to every printed value. */
function twig_print(mixed $value): string {
  return $value instanceof SafeString ? (string) $value : escape((string) $value);
}

/** Xss::filter() — strip everything except an allow-list of tags. */
function xss_filter(string $html, array $allowed = ['a', 'em', 'strong', 'code']): Markup {
  return Markup::create(strip_tags($html, $allowed));
}

/**
 * Drupal\\Core\\Template\\Attribute, trimmed to the methods you actually use.
 * (Named TemplateAttribute here only because PHP 8 reserves the global
 * \\Attribute; Drupal's is namespaced, so it has no such problem.)
 */
final class TemplateAttribute implements SafeString {
  public function __construct(private array $storage = []) {
    $this->storage['class'] ??= [];
  }
  public function addClass(string ...$classes): static {
    foreach ($classes as $class) {
      if (!in_array($class, $this->storage['class'], TRUE)) {
        $this->storage['class'][] = $class;
      }
    }
    return $this;
  }
  public function removeClass(string ...$classes): static {
    $this->storage['class'] = array_values(array_diff($this->storage['class'], $classes));
    return $this;
  }
  public function hasClass(string $class): bool {
    return in_array($class, $this->storage['class'], TRUE);
  }
  public function setAttribute(string $name, mixed $value): static {
    $this->storage[$name] = $value;
    return $this;
  }
  public function without(string $name): static {
    $clone = clone $this;
    unset($clone->storage[$name]);
    return $clone;
  }
  public function __toString(): string {
    $out = '';
    foreach ($this->storage as $name => $value) {
      if (is_array($value)) {
        if ($value === []) { continue; }
        $value = implode(' ', $value);
      }
      // Names AND values are escaped here — this is why you never
      // hand-concatenate an attribute string.
      $out .= ' ' . escape((string) $name) . '="' . escape((string) $value) . '"';
    }
    return $out;
  }
}

/** Html::getClass() — lowercase, then make it a legal CSS identifier. */
function clean_class(string $value): string {
  $value = strtr(mb_strtolower($value), [' ' => '-', '_' => '-', '/' => '-', '[' => '-', ']' => '']);
  return preg_replace('/[^a-z0-9\\-]/', '', $value);
}

/** t() / FormattableMarkup: the three sigils, in one pass. */
function t(string $format, array $args = []): Markup {
  $replacements = [];
  foreach ($args as $key => $value) {
    $replacements[$key] = match ($key[0]) {
      // @placeholder: plain text, escaped (unless already safe).
      '@' => twig_print($value),
      // %placeholder: escaped AND wrapped for emphasis.
      '%' => '<em class="placeholder">' . twig_print($value) . '</em>',
      // :placeholder: for href="" — dangerous protocols stripped, then escaped.
      ':' => escape(preg_replace('#^\\s*javascript\\s*:#i', '', (string) $value)),
      default => throw new InvalidArgumentException("Bad placeholder $key"),
    };
  }
  return Markup::create(strtr($format, $replacements));
}

// --- The template renders ------------------------------------------------
$attributes = (new TemplateAttribute(['id' => 'incident-42', 'class' => ['incident']]))
  ->addClass('incident--' . clean_class('critical'))
  ->addClass('is-open', 'incident')
  ->removeClass('incident')
  ->setAttribute('data-title', 'Payments "down" & slow');

echo "<article{$attributes}>\\n";
echo "  outer div, class dropped:<div{$attributes->without('class')}>\\n";
echo '  hasClass(is-open): ' . var_export($attributes->hasClass('is-open'), TRUE) . "\\n";

$title = 'Payments <script>alert(1)</script> down';
echo '  {{ title }}          -> ' . twig_print($title) . "\\n";
echo '  {{ title|raw }}      -> ' . twig_print(Markup::create($title)) . "\\n";
echo '  Xss::filter(title)   -> ' . twig_print(xss_filter('Payments <script>alert(1)</script> <em>down</em>')) . "\\n";

echo "\\n" . twig_print(t('Incident %title reported by @user. <a href=":url">View</a>', [
  '%title' => $title,
  '@user'  => 'a&b <b>ops</b>',
  ':url'   => '/incidents/42?ref=a&b',
])) . "\\n";

echo twig_print(t('<a href=":url">Click</a>', [':url' => 'javascript:alert(1)'])) . "\\n";
`,
    output: `<article id="incident-42" class="incident--critical is-open" data-title="Payments &quot;down&quot; &amp; slow">
  outer div, class dropped:<div id="incident-42" data-title="Payments &quot;down&quot; &amp; slow">
  hasClass(is-open): true
  {{ title }}          -> Payments &lt;script&gt;alert(1)&lt;/script&gt; down
  {{ title|raw }}      -> Payments <script>alert(1)</script> down
  Xss::filter(title)   -> Payments alert(1) <em>down</em>

Incident <em class="placeholder">Payments &lt;script&gt;alert(1)&lt;/script&gt; down</em> reported by a&amp;b &lt;b&gt;ops&lt;/b&gt;. <a href="/incidents/42?ref=a&amp;b">View</a>
<a href="alert(1)">Click</a>
`,
  },

  keyPoints: [
    "attributes is a Drupal\\Core\\Template\\Attribute object, not a string: addClass / removeClass / setAttribute / hasClass mutate and return $this, without('key') returns a clone. It prints with a LEADING space, so write <div{{ attributes }}>.",
    "create_attribute({...}) makes a fresh Attribute in Twig; new Attribute([...]) does it in preprocess. A plain array you invent in preprocess has no .addClass() until you wrap it.",
    "|clean_class and |clean_id (Html::getClass() / Html::getId(), plus Html::getUniqueId() in PHP) turn arbitrary labels into legal CSS identifiers — never interpolate a raw field value into a class.",
    "Twig escapes everything it prints unless the value implements MarkupInterface. Trust is a type, so Markup::create() on user input disables escaping for that string everywhere downstream — the classic Drupal XSS.",
    "Escaping ladder, weakest first: Html::escape (or '#plain_text') → Xss::filter (user rich text, tiny allow-list) → Xss::filterAdmin (trusted admin; also what '#markup' runs through) → Markup::create (an assertion, not a check).",
    "t() sigils: @name escapes, %name escapes and wraps in <em class=\"placeholder\">, :name is for href=\":name\" and strips dangerous protocols. Always a literal format string — never concatenation.",
  ],

  interview: [
    {
      q: "In a Twig template you need `<div class=\"card\">` plus whatever classes core and contrib already put on the element. Why isn't `<div class=\"card {{ attributes.class }}\">` acceptable?",
      a: "Because `attributes` is an object, not a bag of strings, and `class` is only one of the keys it carries. Printing `attributes.class` throws away the `id`, the `data-*` keys, `lang`, `dir`, and anything Layout Builder, Quick Edit or a contrib module added — which is exactly how you break contextual links or JavaScript that queries by `data-drupal-selector`. The idiomatic form is `<div{{ attributes.addClass('card') }}>`: it mutates the shared object and prints the complete set, with the leading space already included. If you genuinely need to split an attribute set across two elements, `attributes.without('class')` gives you a clone minus that one key while leaving the original intact.",
    },
    {
      q: "Walk me through choosing between Html::escape(), Xss::filter(), Xss::filterAdmin() and Markup::create().",
      a: "They are a ladder from least to most trusting, and the rule is to use the weakest one that still renders what you need. `Html::escape()` is for plain text — no HTML survives; the render-array equivalent is `'#plain_text'`. `Xss::filter()` is for anything a normal user typed: it allows a deliberately tiny list (`a, em, strong, cite, blockquote, code, ul, ol, li, dl, dt, dd`). `Xss::filterAdmin()` is for content authored by a trusted administrator — it allows almost everything except `script`, `style`, `iframe`, `form` and `input`; it is also what the renderer silently applies to `'#markup'`, which is why a `<form>` in `#markup` disappears. `Markup::create()` disables escaping entirely: it is an assertion that *you* constructed the string safely. Calling it on user input, config a lower-privileged user can edit, or a query parameter is the textbook Drupal XSS. For editorial body text the correct answer is usually none of these — use `'#type' => 'processed_text'` so the site's text format does the filtering.",
    },
    {
      q: "What do @, % and : mean in t(), and what happens if you write t(\"Hello \" . $name)?",
      a: "`@name` runs the value through `Html::escape()` (and passes it through untouched if it already implements `MarkupInterface`, so a rendered link doesn't get double-escaped). `%name` does the same escaping and then wraps the result in `<em class=\"placeholder\">`, which is the visual convention core uses for user-supplied values in status messages. `:name` is for a URL used inside a quoted attribute — `t('<a href=\":url\">View</a>', [':url' => …])` — and it runs `UrlHelper::stripDangerousProtocols()` before escaping, so `javascript:` payloads are neutralised. Concatenating breaks two things at once: the translation extractor keys the catalogue on the literal source string, so `'Hello ' . $name` produces a string that can never be translated, and the interpolated value skips the placeholder escaping entirely. The result of `t()` is a `TranslatableMarkup`, which is a `MarkupInterface` — that is why Twig prints it unescaped, and it is safe precisely because each placeholder was escaped individually.",
    },
    {
      q: "You see `{{ incident_summary|raw }}` in a pull request for incident_theme. How do you review it?",
      a: "`|raw` is not automatically wrong, but it shifts the burden of proof onto the author, so I trace where `incident_summary` comes from. If it is a `TranslatableMarkup`, a `Link`, or a rendered child of a render array, `|raw` is redundant — those are already `MarkupInterface` and Twig prints them unescaped without it, so the filter is noise that hides the real question. If it comes from a preprocess function that concatenated a field value, a query parameter or a config string, it is a live XSS and the fix is either `'#type' => 'processed_text'`, `Xss::filter()`, or restructuring so the pieces stay as separate variables Twig can escape individually. The same review applies to `Markup::create()` in PHP — it is the same hole with a different spelling. A useful rule for the team: `|raw` on a variable whose provenance isn't obvious from the same file is a blocker.",
    },
  ],

  quiz: [
    {
      question:
        "Which line correctly adds a class to an element while preserving every other attribute Drupal and contrib have set?",
      options: [
        "<div class=\"card {{ attributes.class }}\">",
        "<div {{ attributes.addClass('card') }}>",
        "<div{{ attributes.addClass('card') }}>",
        "<div{{ attributes|merge({'class': 'card'}) }}>",
      ],
      answerIndex: 2,
      explain:
        "Attribute::__toString() emits its own leading space, so putting one before it produces a double space and, more importantly, is the tell that the author thinks it's a string. Printing attributes.class alone discards id, data-* and everything else on the object, and |merge is an array filter that doesn't work on the object's class list.",
    },
    {
      question:
        "$comment_body came from an authenticated but non-privileged user. Which is safe to put in a render array?",
      options: [
        "['#markup' => Markup::create($comment_body)]",
        "['#markup' => $comment_body]",
        "['#markup' => Xss::filterAdmin($comment_body)]",
        "['#markup' => Xss::filter($comment_body)]",
      ],
      answerIndex: 3,
      explain:
        "Xss::filter() applies the small allow-list intended for user-submitted content. Markup::create() disables escaping outright — the classic XSS. Xss::filterAdmin() is far too permissive for a non-privileged user. Passing the raw string is closest to acceptable (the renderer applies Xss::filterAdmin to #markup) but still allows admin-level tags from an ordinary user; better still would be '#plain_text' or '#type' => 'processed_text'.",
    },
    {
      question:
        "Which t() call correctly renders a link to the incident without opening an XSS hole?",
      options: [
        "$this->t('<a href=\"@url\">View</a>', ['@url' => $url])",
        "$this->t('<a href=\":url\">View</a>', [':url' => $node->toUrl()->toString()])",
        "$this->t('<a href=\"' . $url . '\">View</a>')",
        "$this->t('%link', ['%link' => Markup::create('<a href=\"' . $url . '\">View</a>')])",
      ],
      answerIndex: 1,
      explain:
        "The colon sigil exists exactly for URLs inside a quoted attribute: it runs UrlHelper::stripDangerousProtocols() and then escapes, so a javascript: value is neutralised. @ escapes for text context and is not protocol-aware, concatenation destroys translatability and escaping, and wrapping hand-built HTML in Markup::create() bypasses the safety model entirely.",
    },
    {
      question:
        "In preprocess you set $variables['badge_attributes'] = ['class' => ['badge']]. The template calls badge_attributes.addClass('badge--open') and Twig throws. Why?",
      options: [
        "addClass() only exists on the 'attributes' variable, not on custom ones",
        "A plain PHP array has no methods — it must be wrapped in a Drupal\\Core\\Template\\Attribute object",
        "The variable name must end in '_attributes' for Drupal to convert it",
        "Twig's sandbox blocks method calls on preprocess variables",
      ],
      answerIndex: 1,
      explain:
        "The theme manager converts exactly three variables — attributes, title_attributes and content_attributes — into Attribute objects before the template runs, and merges a themed element's '#attributes' into the first of them. A variable you invent in your own preprocess is not on that list, so it stays whatever you assigned. Wrap it — new Attribute(['class' => ['badge']]) in PHP, or create_attribute({'class': ['badge']}) in the template. The suffix has no special meaning.",
    },
  ],
};

export default lesson;
