import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "single-directory-components",
  title: "Single Directory Components (SDC)",
  part: "Assets, Components & Layout",
  estMinutes: 13,
  summary:
    "Build incident-card as a folder — component.yml with a JSON-Schema props contract and named slots, a Twig file, and co-located CSS/JS that attach themselves — then render it from a render array, from {{ include() }} and from {% embed %}, and know exactly where it fits next to hook_theme.",

  concept: `
## The folder is the component

Everything else in this course splits a UI piece across four places: a
\`hook_theme()\` entry in a .module file, a template in \`templates/\`, a
preprocess function, and a library in \`*.libraries.yml\`. A **single directory
component** puts all of it in one folder:

\`\`\`
incident_theme/
  components/
    incident-card/
      incident-card.component.yml
      incident-card.twig
      incident-card.css
      incident-card.js
\`\`\`

The folder name is the machine name. The full ID is
\`provider:machine-name\` — \`incident_theme:incident-card\`. Modules can ship
components too (\`incident_tracker:incident-card\`), and both are discovered
from a top-level \`components/\` directory with no registration step at all.

### component.yml is a contract

\`\`\`yaml
$schema: https://git.drupalcode.org/project/drupal/-/raw/HEAD/core/assets/schemas/v1/metadata.schema.json
name: Incident card
status: stable
group: Incidents
props:
  type: object
  required: [title, severity]
  properties:
    title: { type: string }
    severity: { type: string, enum: [low, high, critical] }
    minutes_open: { type: integer, default: 0 }
    attributes: { type: Drupal\\Core\\Template\\Attribute }
slots:
  footer:
    title: Footer
\`\`\`

**Props are typed and validated**; **slots are not**. That split is the whole
design. A prop is scalar-ish data described by JSON Schema (plus a few PHP class
types like \`Attribute\`). A slot is arbitrary renderable content — a render
array, a nested component, markup — and core deliberately never type-checks it.

Validation runs at render time when the site is in development mode, and you can
force every component in a theme to carry a schema with
\`enforce_prop_schemas: true\` in \`incident_theme.info.yml\`. Passing
\`severity: 'urgent'\` then throws \`InvalidComponentException\` instead of
silently rendering a class nobody styled.

### Three ways to render it

\`\`\`php
$build['card'] = [
  '#type' => 'component',
  '#component' => 'incident_theme:incident-card',
  '#props' => ['title' => $incident->label(), 'severity' => 'high'],
  '#slots' => ['footer' => $link_render_array],
];
\`\`\`

In Twig, \`{{ include('incident_theme:incident-card', { title: node.label }, with_context = false) }}\`
for props only, and \`{% embed %}\` when you need slots — each slot is a Twig
\`{% block %}\` inside the component template, so the caller fills it with
\`{% block footer %}...{% endblock %}\`.

### Assets, for free

\`incident-card.css\` and \`incident-card.js\` are picked up automatically and
attached only when the component actually renders. Core registers them as the
library \`core/components.incident_theme--incident-card\`; add dependencies or
file attributes with a \`libraryOverrides:\` key rather than editing
libraries.yml.

### What SDC does not replace

It does **not** replace theme hooks. Core still renders nodes through
\`node.html.twig\`, fields through \`field.html.twig\`, forms through element
templates — that whole registry and its suggestion system are untouched. SDC is
the *reusable UI piece* layer underneath: your \`node--incident.html.twig\`
becomes a thin adapter that maps entity data to props and includes the
component. You cannot target a component with a theme suggestion; you replace it
by shipping a component in your theme with \`replaces: 'incident_tracker:incident-card'\`.

Version notes: experimental in 10.1, stable in 10.3, fully supported in 11.
`,

  comparisons: [
    {
      label: "Defining the component",
      intro:
        "Symfony UX TwigComponent declares the contract as a PHP class with typed public properties; SDC declares it as JSON Schema in a YAML sidecar. Same idea, different serialisation.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// src/Twig/Components/IncidentCard.php
namespace App\\Twig\\Components;

use Symfony\\UX\\TwigComponent\\Attribute\\AsTwigComponent;

#[AsTwigComponent]
final class IncidentCard
{
    // The contract is PHP type hints; the container validates
    // by refusing to set a property that does not exist.
    public string $title;
    public string $severity = 'low';
    public int $minutesOpen = 0;

    public function severityClass(): string
    {
        return 'incident-card--' . $this->severity;
    }
}

// templates/components/IncidentCard.html.twig lives elsewhere
// in the tree; the CSS/JS live in assets/ and are wired by Encore.`,
      ts: `# incident_theme/components/incident-card/incident-card.component.yml
$schema: https://git.drupalcode.org/project/drupal/-/raw/HEAD/core/assets/schemas/v1/metadata.schema.json
name: Incident card
description: One incident summarised as a card.
status: stable
group: Incidents

props:
  type: object
  required:
    - title
    - severity
  properties:
    title:
      type: string
      title: Incident title
    severity:
      type: string
      enum: [low, high, critical]
    minutes_open:
      type: integer
      default: 0
    attributes:
      type: Drupal\\Core\\Template\\Attribute

slots:
  footer:
    title: Footer
    description: Operations links, rendered after the body.

libraryOverrides:
  dependencies:
    - core/once`,
      note: "SDC has no PHP class at all — no computed methods. Anything derived (a severity class, a formatted date) is computed by the caller or with Twig in the component template.",
    },
    {
      label: "Calling it from a template",
      intro:
        "Render the card from a listing template, passing data in and a link into the footer slot.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# Symfony UX TwigComponent: HTML syntax, or the component() function. #}
{% for incident in incidents %}
  <twig:IncidentCard
    title="{{ incident.title }}"
    severity="{{ incident.severity }}"
    :minutesOpen="incident.minutesOpen"
  >
    {# Anonymous "content" block — the default slot. #}
    <a href="{{ path('incident_show', {id: incident.id}) }}">Open</a>
  </twig:IncidentCard>
{% endfor %}

{# Function form, no slots: #}
{{ component('IncidentCard', { title: 'DB replica lag', severity: 'high' }) }}`,
      ts: `{# incident_theme/templates/content/node--incident--teaser.html.twig
   Props only: the include() function. with_context = false is the
   equivalent of Twig's "only" — it stops the entire Drupal template
   context (node, user, theme hook vars) leaking into the component. #}
{{ include('incident_theme:incident-card', {
  title: label,
  severity: node.field_severity.value,
  minutes_open: minutes_open,
}, with_context = false) }}

{# Props AND slots: embed, because slots are Twig blocks.
   No "only" here, deliberately. Twig compiles the {% block %} bodies
   below into the embed's own inline template, so "only" would hide
   the caller's variables (url) from THEM as well as from the
   component. Core's generated embed omits "only" for this reason. #}
{% embed 'incident_theme:incident-card' with {
  title: label,
  severity: node.field_severity.value,
} %}
  {% block footer %}
    {{ link('Open incident'|t, url) }}
  {% endblock %}
{% endembed %}`,
      note: "There is no <twig:...> tag syntax in core Drupal — the ID string 'provider:machine-name' is the addressing scheme, and slots are always Twig blocks. Note the missing 'only' on the embed: it isolates the slot blocks too, not just the component, so with 'only' the footer block would see an undefined url. Core's own ComponentElement builds its wrapper as {% embed 'provider:name' %} with no 'only' precisely so the generated slot blocks can read the outer context. Keep 'only' if you want the isolation, but then every variable your blocks touch has to travel in the with hash.",
    },
    {
      label: "Calling it from PHP",
      intro:
        "A controller builds a list of cards. Symfony renders a template to a string; Drupal returns a render array so caching, lazy building and #attached still work.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// src/Controller/IncidentController.php
public function board(IncidentRepository $repo): Response
{
    // Rendering happens now, inside the controller's response.
    // Assets are whatever Encore emitted for the whole page.
    return $this->render('incident/board.html.twig', [
        'incidents' => $repo->findOpen(),
    ]);
}`,
      ts: `<?php
// incident_tracker/src/Controller/IncidentBoardController.php
public function board(): array {
  $build = ['#type' => 'container'];
  $incidents = $this->entityTypeManager->getStorage('node')
    ->loadByProperties(['type' => 'incident', 'status' => 1]);
  foreach ($incidents as $incident) {
    $build[$incident->id()] = [
      '#type' => 'component',
      '#component' => 'incident_theme:incident-card',
      '#props' => [
        'title' => $incident->label(),
        'severity' => $incident->get('field_severity')->value,
        // An incident is a node, so derive this from the created time.
        'minutes_open' => (int) floor((\\Drupal::time()->getRequestTime() - $incident->getCreatedTime()) / 60),
        'attributes' => new Attribute(['id' => 'incident-' . $incident->id()]),
      ],
      // Slots take render arrays, not strings.
      '#slots' => [
        'footer' => [
          '#type' => 'link',
          '#title' => $this->t('Open incident'),
          '#url' => $incident->toUrl(),
        ],
      ],
      '#cache' => ['tags' => $incident->getCacheTags()],
    ];
  }
  return $build;
}`,
      note: "'#type' => 'component' is a normal render element: it bubbles cache metadata, accepts #attached alongside, and can sit anywhere a render array can — inside a form, a block, a field formatter.",
    },
    {
      label: "Shipping the CSS and JS",
      intro:
        "The component needs a stylesheet and a small behaviour. Symfony routes them through a bundler entrypoint; SDC just looks in the folder.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# webpack.config.js / assets — the component's CSS and JS are
# entries in a global build, loaded for the whole page whether or
# not the component appears on it.
#
#   .addEntry('incident-card', './assets/incident-card.js')
#
# templates/base.html.twig:
#   {{ encore_entry_link_tags('incident-card') }}
#   {{ encore_entry_script_tags('incident-card') }}
#
# Nothing ties the asset to the component except your discipline:
# delete the component and the entry stays behind.`,
      ts: `# Nothing to declare. These files, sitting next to the .twig:
#
#   components/incident-card/incident-card.css
#   components/incident-card/incident-card.js
#
# become the library core/components.incident_theme--incident-card
# and are attached ONLY on responses where the component rendered.
#
# Need more than the defaults? Add to incident-card.component.yml:

libraryOverrides:
  dependencies:
    - core/drupal
    - core/once
  js:
    incident-card.js: { attributes: { defer: true } }
  css:
    component:
      incident-card.css: {}

# Attach it by hand from any other template if you must:
#   {{ attach_library('core/components.incident_theme--incident-card') }}`,
      note: "Delete the folder and the library disappears with it. That co-location — and the fact that the asset only ships when the component renders — is the main practical win over a libraries.yml entry.",
    },
  ],

  playground: {
    intro:
      "A miniature SDC engine in plain PHP: validate the caller's props against the schema, fill defaults, substitute slots (never type-checked) and props. Predict both blocks of output before revealing.",
    lang: "php",
    code: `<?php
// Validate props against the component schema, fill defaults, then
// substitute props and slots. Drupal does this shape of work before Twig runs.

$component = [
  'id' => 'incident_theme:incident-card',
  'props' => [
    'type' => 'object',
    'required' => ['title', 'severity'],
    'properties' => [
      'title'        => ['type' => 'string'],
      'severity'     => ['type' => 'string', 'enum' => ['low', 'high', 'critical']],
      'minutes_open' => ['type' => 'integer', 'default' => 0],
      'acknowledged' => ['type' => 'boolean', 'default' => FALSE],
    ],
  ],
  'slots' => ['footer'],
  'template' =>
    "<article class=\\"incident-card incident-card--{severity}\\">\\n" .
    "  <h3>{title}</h3>\\n" .
    "  <p>Open {minutes_open} min - acknowledged: {acknowledged}</p>\\n" .
    "  <footer>{{footer}}</footer>\\n" .
    "</article>",
];

function sdc_type(mixed $value): string {
  return match (TRUE) {
    is_bool($value) => 'boolean',
    is_int($value) => 'integer',
    is_float($value) => 'number',
    is_string($value) => 'string',
    is_array($value) => 'array',
    default => 'unknown',
  };
}

function validate_props(array $component, array $props): array {
  $schema = $component['props'];
  $errors = [];
  foreach ($schema['required'] as $name) {
    if (!array_key_exists($name, $props)) {
      $errors[] = sprintf('[%s] missing required prop "%s"', $component['id'], $name);
    }
  }
  foreach ($props as $name => $value) {
    if (!isset($schema['properties'][$name])) {
      $errors[] = sprintf('[%s] prop "%s" is not declared in the schema', $component['id'], $name);
      continue;
    }
    $definition = $schema['properties'][$name];
    $actual = sdc_type($value);
    if ($actual !== $definition['type']) {
      $errors[] = sprintf('[%s] prop "%s" expects %s, got %s', $component['id'], $name, $definition['type'], $actual);
    }
    elseif (isset($definition['enum']) && !in_array($value, $definition['enum'], TRUE)) {
      $errors[] = sprintf(
        '[%s] prop "%s" must be one of [%s], got "%s"',
        $component['id'], $name, implode(', ', $definition['enum']), $value
      );
    }
  }
  return $errors;
}

function render_component(array $component, array $props, array $slots): string {
  $errors = validate_props($component, $props);
  if ($errors) {
    return "InvalidComponentException\\n  " . implode("\\n  ", $errors) . "\\n";
  }
  foreach ($component['props']['properties'] as $name => $definition) {
    if (!array_key_exists($name, $props) && array_key_exists('default', $definition)) {
      $props[$name] = $definition['default'];
    }
  }
  $out = $component['template'];
  // Slots are raw renderables - they are never type-checked.
  foreach ($component['slots'] as $slot) {
    $out = str_replace('{{' . $slot . '}}', $slots[$slot] ?? '', $out);
  }
  foreach ($props as $name => $value) {
    $printed = is_bool($value) ? ($value ? 'yes' : 'no') : (string) $value;
    $out = str_replace('{' . $name . '}', $printed, $out);
  }
  return $out . "\\n";
}

echo "== valid props, one slot, two defaults filled in ==\\n";
echo render_component(
  $component,
  ['title' => 'DB replica lag', 'severity' => 'high'],
  ['footer' => '<a href="/incident/7">Open incident</a>']
);

echo "\\n== the same component in dev mode, called badly ==\\n";
echo render_component(
  $component,
  ['title' => 'Cache stampede', 'severity' => 'urgent', 'minutes_open' => '42', 'colour' => 'red'],
  []
);
`,
    output: `== valid props, one slot, two defaults filled in ==
<article class="incident-card incident-card--high">
  <h3>DB replica lag</h3>
  <p>Open 0 min - acknowledged: no</p>
  <footer><a href="/incident/7">Open incident</a></footer>
</article>

== the same component in dev mode, called badly ==
InvalidComponentException
  [incident_theme:incident-card] prop "severity" must be one of [low, high, critical], got "urgent"
  [incident_theme:incident-card] prop "minutes_open" expects integer, got string
  [incident_theme:incident-card] prop "colour" is not declared in the schema
`,
  },

  keyPoints: [
    "A component is a folder under components/ named for its machine name: NAME.component.yml + NAME.twig, optional co-located CSS/JS. Addressed everywhere as 'provider:machine-name'.",
    "props are JSON Schema and are validated (in dev, or always when the theme sets enforce_prop_schemas: true); slots are arbitrary renderables and are never type-checked.",
    "Render it with '#type' => 'component' / '#component' / '#props' / '#slots', with {{ include('theme:name', {...}, with_context = false) }} for props only, or {% embed %} plus {% block %} when you need slots.",
    "Co-located CSS/JS become core/components.PROVIDER--MACHINE-NAME automatically and attach only when the component renders; tune them with libraryOverrides, not libraries.yml.",
    "SDC complements the theme registry — it does not replace hook_theme, template suggestions or preprocess. Your node/field templates become thin adapters that map data to props.",
    "You cannot override a component with a theme suggestion; a theme replaces one by shipping a component whose YAML declares replaces: 'other_provider:name'. Experimental in 10.1, stable in 10.3+, standard in 11.",
  ],

  interview: [
    {
      q: "Does SDC replace hook_theme() and the theme registry?",
      a: `No, and saying so is a good way to show you understand the layering. Core still renders every node, field, form element and view through the theme registry — \`hook_theme()\` entries, template suggestions, preprocess functions and the \`templates/\` directory are all unchanged. SDC sits *below* that as the reusable-UI-piece layer: a component has no theme hook, no suggestion chain, no preprocess hook, and it never renders because Drupal decided to render it — something has to call it explicitly. The idiomatic pattern is that \`node--incident--teaser.html.twig\` stays a theme-registry template but shrinks to an adapter that maps entity data onto props and calls \`{{ include('incident_theme:incident-card', {...}, with_context = false) }}\`. If you want to swap a component out, you do not write a suggestion — you ship a component in your theme with a \`replaces:\` key.`,
    },
    {
      q: "Props versus slots — what is the actual difference, and why does it matter?",
      a: `Props are data described by JSON Schema in \`component.yml\`: strings, integers, booleans, enums, arrays, plus a handful of PHP class types like \`Drupal\\Core\\Template\\Attribute\`. Slots are arbitrary renderable content — a render array, markup, another component — and core deliberately does not validate them. The consequence is a design rule: anything you want a contract on (a severity level, a heading level, a variant name) must be a prop, and anything you want a caller to compose freely (operation links, a nested list) must be a slot. Mechanically, props go in \`with {...}\` or \`'#props'\`, while slots are Twig \`{% block %}\`s in the component template, filled by \`{% embed %}\` or by \`'#slots'\` in a render array. Getting this wrong usually shows up as someone stuffing pre-rendered HTML into a string prop, which loses cache metadata and defeats the point.`,
    },
    {
      q: "How do a component's CSS and JS get onto the page, and how is that better than libraries.yml?",
      a: `Any \`NAME.css\` / \`NAME.js\` sitting next to \`NAME.twig\` is discovered automatically and registered as \`core/components.PROVIDER--MACHINE-NAME\`. Drupal attaches it during rendering, so the CSS ships only on responses where the component actually rendered — no page-wide bundle, no manual \`#attached\` or \`attach_library()\`. If you need dependencies or file attributes you add a \`libraryOverrides:\` block to the same \`component.yml\` rather than a separate \`*.libraries.yml\` entry. Compared with Encore, where an entrypoint outlives the template that used it, deleting the component folder deletes the library too — the asset cannot drift away from the markup it styles.`,
    },
    {
      q: "How does SDC compare to Symfony UX Twig Components, and what would you watch out for moving between them?",
      a: `They are close cousins: both give you a named, reusable Twig unit with a declared input contract, slots for free-form content and co-located assets. The big differences are that a Symfony component's contract is a PHP class with typed properties (and can have computed methods, mount hooks and Live Component behaviour), whereas SDC has no PHP class at all — the contract is JSON Schema in YAML, and any derived value must be computed by the caller or in the template. Addressing differs too: Symfony has the \`<twig:IncidentCard>\` tag syntax and \`component()\`, while SDC always uses the \`provider:machine-name\` string with \`include()\` or \`{% embed %}\`. And SDC components are rendered through render arrays, so they participate in Drupal's cache-metadata bubbling and lazy building — something a Symfony component has no equivalent of.`,
    },
  ],

  quiz: [
    {
      question:
        "Your component template prints a footer with {% block footer %}{% endblock %} and you need to pass a link into it from a listing template. Which Twig construct do you use?",
      options: [
        "{{ include('incident_theme:incident-card', { footer: link }) }}",
        "{% embed 'incident_theme:incident-card' with { title: label } %}{% block footer %}...{% endblock %}{% endembed %}",
        "{{ component('incident-card', { footer: link }) }}",
        "{% extends 'incident_theme:incident-card' %}{% block footer %}...{% endblock %}",
      ],
      answerIndex: 1,
      explain:
        "Slots are Twig blocks, and only {% embed %} lets a caller both pass props and override blocks. include() can pass props but has no way to fill a block; extends would replace the calling template entirely, and there is no component() function in core Drupal.",
    },
    {
      question:
        "incident-card.component.yml declares severity with enum [low, high, critical]. A render array passes 'severity' => 'urgent' on a production site with no development settings and no enforce_prop_schemas. What happens?",
      options: [
        "The page always fatals with InvalidComponentException",
        "Drupal silently substitutes the first enum value, 'low'",
        "It renders — schema validation is a development-time guard, and enforce_prop_schemas is what makes it non-negotiable for a theme",
        "The component is skipped and an empty string is rendered in its place",
      ],
      answerIndex: 2,
      explain:
        "Prop validation is a developer-experience feature: it runs when the site is in development mode, and a theme can insist on schemas with enforce_prop_schemas: true in its .info.yml. Production sites do not pay the validation cost, which is exactly why you want the error to surface locally and in CI.",
    },
    {
      question:
        "A contrib theme ships incident_tracker:incident-card and you want your own markup for it site-wide. What is the supported approach?",
      options: [
        "Implement hook_theme_suggestions_alter() and add a suggestion for the component",
        "Copy the folder into your theme's components/ directory under the same name — same-name components in a theme always win",
        "Ship a component in incident_theme whose component.yml declares replaces: 'incident_tracker:incident-card'",
        "Override the template with incident-card--incident-tracker.html.twig in templates/",
      ],
      answerIndex: 2,
      explain:
        "Components are outside the theme registry, so suggestions and templates/ overrides do not apply to them. A theme (modules cannot do this) replaces another provider's component by declaring replaces: with the full component ID; both components must have a defined schema.",
    },
    {
      question:
        "Where do a component's co-located CSS and JS end up in Drupal's asset system?",
      options: [
        "Nowhere — you must add them to your theme's libraries.yml by hand",
        "In an automatically registered library, core/components.PROVIDER--MACHINE-NAME, attached only when the component renders",
        "They are inlined into the page's <head> on every request",
        "In the theme's global-styling library, so they load on every page",
      ],
      answerIndex: 1,
      explain:
        "SDC discovers NAME.css and NAME.js beside NAME.twig and registers them as core/components.PROVIDER--MACHINE-NAME. Because attachment happens during rendering, the assets ship only on responses that actually contain the component; libraryOverrides in component.yml is where you add dependencies or file attributes.",
    },
  ],
};

export default lesson;
