import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "states-conditional-ui",
  title: "#states: Conditional UI Without Writing JavaScript",
  part: "Form API in Depth",
  estMinutes: 12,
  summary:
    "Drive show/hide, enable/disable and required-ness declaratively with #states — and learn exactly where it stops, because none of it is enforced on the server.",

  concept: `
In Symfony you would reach for a Stimulus controller or a
\`POST_SET_DATA\`/\`PRE_SUBMIT\` form event listener to make one field react to
another. Drupal ships a declarative alternative: put a \`#states\` array on any
render element and core writes the JavaScript for you.

### What actually happens

\`#states\` is not processed by the Form API at all — it is processed by the
**renderer**. In \`Renderer::doRender()\`:

\`\`\`php
if (!empty($elements['#states'])) {
  FormHelper::processStates($elements);
}
\`\`\`

\`FormHelper::processStates()\` does exactly two things: it attaches the
\`core/drupal.states\` library, and it JSON-encodes your array into a
\`data-drupal-states\` attribute on the element (or on
\`#wrapper_attributes\` for inputs rendered with empty \`#markup\`). Everything
after that is \`core/misc/states.js\` reading that attribute in the browser.
Two consequences fall straight out of this: it works on **any** render element
that gets attributes, not just form inputs — and with JavaScript off, nothing
happens at all.

### The vocabulary

**States you can apply** (the ones with real DOM handlers):
\`visible\`/\`invisible\`, \`enabled\`/\`disabled\`, \`required\`/\`optional\`,
\`checked\`/\`unchecked\`, \`expanded\`/\`collapsed\` (aliases \`open\`/\`closed\`),
plus \`readonly\`/\`readwrite\`. States like \`relevant\` or \`valid\` exist in
\`Drupal.states.State.aliases\` but have no handler — setting them does nothing
visible.

**Conditions you can test** — only four triggers are instrumented in
\`states.js\`: \`value\`, \`checked\`, \`empty\`, \`collapsed\`. Aliases give you
\`unchecked\`, \`filled\`, \`expanded\`; a leading \`!\` inverts anything, so
\`['!value' => 'outage']\` is legal.

### AND, OR, XOR

The array shape *is* the boolean operator:

- **Associative** array of selectors → **AND**. Every selector must match.
- **Indexed** array of condition arrays → **OR**.
- Put the literal string \`'xor'\` in that indexed array → **exclusive OR**.

A detail worth knowing: \`states.js\` only special-cases the string \`'xor'\`.
The \`'or'\` you see in every example is a readability convention — an indexed
array is already OR, and a stray \`'or'\` string evaluates to \`undefined\` and
is ignored. Write it anyway; the next developer reads it as documentation.
Several conditions on one selector also OR:
\`[':input[name="severity"]' => [['value' => 'critical'], ['value' => 'high']]]\`.

### The two gotchas that bite in code review

**1. Nothing is enforced server-side.** A \`required\` state does not set
\`#required\` and adds no validation. A field hidden by \`visible\` is still in
the DOM and still POSTs its value. Worse, \`#states\` \`disabled\` is not the
same as \`#disabled\`: core's \`#disabled\` re-asserts the default value in
\`FormBuilder\` so a tampered POST is discarded, while a states-disabled field
has no such protection. Mirror every condition in \`validateForm()\`.

**2. Selectors must match the rendered \`name\` attribute.** \`:input\` is a
jQuery pseudo-selector meaning "input, select, textarea or button". With
\`#tree\`, deltas and field widgets the names get long:
\`:input[name="field_summary[0][value]"]\`,
\`:input[name="dates[start][date]"]\`. The delta + column shape is not
universal, though: widgets declared \`multiple_values: TRUE\` —
\`options_select\` (Select list) and \`options_buttons\` (Check boxes/radio
buttons) — are not keyed by delta in \`WidgetBase::form()\`, so a list field
using one of them renders as a bare \`name="field_severity"\`. Radios share one
name; a \`checkboxes\` element gives each option \`category[outage]\`. When in
doubt, render the form and read the HTML.
`,

  comparisons: [
    {
      label: "Show a field only when another field has a value",
      intro:
        "The incident form has a category select; the 'outage started at' field should appear only for outages. In Symfony you write and register JavaScript; in Drupal you write an array on the element.",
      php: `// assets/controllers/conditional_controller.js — Stimulus
import { Controller } from '@hotwired/stimulus';

export default class extends Controller {
  static targets = ['trigger', 'dependent'];

  connect() {
    this.toggle();
  }

  toggle() {
    const show = this.triggerTarget.value === 'outage';
    this.dependentTarget.hidden = !show;
  }
}

// templates/incident/_form.html.twig
// <div data-controller="conditional">
//   {{ form_row(form.category, {
//        attr: {
//          'data-conditional-target': 'trigger',
//          'data-action': 'change->conditional#toggle'
//        }
//   }) }}
//   <div data-conditional-target="dependent">
//     {{ form_row(form.startedAt) }}
//   </div>
// </div>`,
      ts: `<?php
// src/Form/IncidentReportForm.php — buildForm()
$form['category'] = [
  '#type' => 'select',
  '#title' => $this->t('Category'),
  '#options' => [
    'outage' => $this->t('Outage'),
    'degraded' => $this->t('Degraded performance'),
    'security' => $this->t('Security event'),
  ],
  '#empty_option' => $this->t('- Select -'),
];

$form['started_at'] = [
  '#type' => 'datetime',
  '#title' => $this->t('Outage started at'),
  '#states' => [
    'visible' => [
      ':input[name="category"]' => ['value' => 'outage'],
    ],
  ],
];`,
      note:
        "No library to write, no build step. Renderer::doRender() spots #states, calls FormHelper::processStates(), which attaches core/drupal.states and writes data-drupal-states=\"{...}\" onto the element — states.js does the rest client-side.",
      leftLang: "js",
      rightLang: "php",
    },
    {
      label: "AND, OR and XOR: the array shape is the operator",
      intro:
        "In JavaScript you spell out the boolean expression. In #states the nesting encodes it: associative = AND, indexed = OR, and the literal string 'xor' switches an indexed array to exclusive OR.",
      php: `// The same three conditions, written as JS you would own
const category = form.querySelector('[name="category"]').value;
const severity = form.querySelector('[name="severity"]').value;
const oncall   = form.querySelector('[name="notify_oncall"]').checked;

// AND
const showRootCause = category === 'outage' && severity === 'critical';

// OR
const requirePager = severity === 'critical' || oncall;

// XOR — exactly one of the two
const showEscalation = (category === 'outage') !== oncall;

// OR on one field
const showRunbook = ['critical', 'high'].includes(severity);`,
      ts: `<?php
// AND — associative array: every selector must match.
'#states' => [
  'visible' => [
    ':input[name="category"]' => ['value' => 'outage'],
    ':input[name="severity"]' => ['value' => 'critical'],
  ],
],

// OR — indexed array of condition arrays.
'#states' => [
  'required' => [
    [':input[name="severity"]' => ['value' => 'critical']],
    'or',
    [':input[name="notify_oncall"]' => ['checked' => TRUE]],
  ],
],

// XOR — the literal string 'xor' makes it exclusive.
'#states' => [
  'visible' => [
    [':input[name="category"]' => ['value' => 'outage']],
    'xor',
    [':input[name="notify_oncall"]' => ['checked' => TRUE]],
  ],
],

// OR on a single selector — indexed list of conditions.
'#states' => [
  'visible' => [
    ':input[name="severity"]' => [
      ['value' => 'critical'],
      ['value' => 'high'],
    ],
  ],
],`,
      note:
        "Read core/misc/states.js verifyConstraints() once: it only tests for the string 'xor'. An indexed array is OR whether or not you write 'or', and a stray 'or' string resolves to undefined and is skipped — keep writing it for readability, but don't believe it is doing the work.",
      leftLang: "js",
      rightLang: "php",
    },
    {
      label: "The server does not know your #states exist",
      intro:
        "Symfony's validation groups genuinely change what the server enforces. Drupal's #states changes only what the browser paints — the POST is unaffected — so the condition has to be repeated in validateForm().",
      php: `<?php
// Symfony: the condition is enforced server-side by the validator.
namespace App\\Entity;

use Symfony\\Component\\Validator\\Constraints as Assert;
use Symfony\\Component\\Validator\\Context\\ExecutionContextInterface;

class Incident
{
    public ?string $category = null;
    public ?string $startedAt = null;

    #[Assert\\Callback]
    public function validateStartedAt(ExecutionContextInterface $context): void
    {
        if ($this->category === 'outage' && !$this->startedAt) {
            $context->buildViolation('Start time is required for outages.')
                ->atPath('startedAt')
                ->addViolation();
        }
    }
}

// The form can hide startedAt with JS; the validator still rejects
// a POST that omits it. One source of truth, on the server.`,
      ts: `<?php
// Drupal: #states is presentation only. Repeat the rule in validateForm().
public function buildForm(array $form, FormStateInterface $form_state): array {
  $form['started_at'] = [
    '#type' => 'datetime',
    '#title' => $this->t('Outage started at'),
    '#states' => [
      'visible' => [':input[name="category"]' => ['value' => 'outage']],
      // Paints the red asterisk and sets the required attribute.
      // It does NOT set #required and adds NO validation.
      'required' => [':input[name="category"]' => ['value' => 'outage']],
    ],
  ];
  return $form;
}

public function validateForm(array &$form, FormStateInterface $form_state): void {
  if ($form_state->getValue('category') === 'outage'
      && $form_state->isValueEmpty('started_at')) {
    $form_state->setErrorByName(
      'started_at',
      $this->t('Start time is required for outages.')
    );
  }
}`,
      note:
        "Two traps in one: a field hidden by #states is still in the DOM and still submits its value, so stale input can sneak through — clear it in validateForm() or submitForm(). And #states 'disabled' is NOT #disabled: core's #disabled re-asserts the default value in FormBuilder so a tampered POST is thrown away, while a states-disabled field offers no such protection.",
      leftLang: "php",
      rightLang: "php",
    },
    {
      label: "Getting the selector right: read the rendered name",
      intro:
        "A #states selector is matched against the real name attribute in the HTML. Symfony's names are predictable from the form's block prefix; Drupal's depend on #tree, on multi-value deltas and on which widget a field uses.",
      php: `{# Symfony renders names from the form's block prefix #}
<select name="incident[category]">…</select>
<input  name="incident[startedAt][date]" type="date">
<input  name="incident[tags][0]" type="text">

{# So a JS hook targets: #}
{# form.querySelector('[name="incident[category]"]') #}

{# Symfony guarantees the prefix, so the name is derivable
   from the form type + property path without rendering. #}`,
      ts: `<?php
// FLAT form (no #tree): the name is just the key.
$form['category'] = ['#type' => 'select', ...];
// -> name="category"          -> :input[name="category"]

// #tree = TRUE: keys are nested into the name.
$form['contact']['#tree'] = TRUE;
$form['contact']['email'] = ['#type' => 'email', ...];
// -> name="contact[email]"    -> :input[name="contact[email]"]

// A DELTA-BASED field widget on a node/entity form: delta + column.
// (string_textfield, number, datetime, entity_reference_autocomplete…)
// -> name="field_summary[0][value]"
// -> name="field_ref[0][target_id]"
'#states' => [
  'visible' => [
    ':input[name="field_summary[0][value]"]' => ['!empty' => TRUE],
  ],
],

// EXCEPTION — widgets declared multiple_values: TRUE (options_select,
// options_buttons) are NOT keyed by delta in WidgetBase::form(); the
// element gets '#parents' => [..., $field_name], so no delta, no column.
// field_severity is a single-value list_string on the incident bundle,
// rendered with the default Select list widget; its keys are the strings
// 'low', 'high' and 'critical'.
// -> name="field_severity"   (field_severity[] if cardinality > 1)
'#states' => [
  'visible' => [
    ':input[name="field_severity"]' => ['value' => 'critical'],
  ],
],

// checkboxes: ONE name per option.
$form['channels'] = [
  '#type' => 'checkboxes',
  '#options' => ['slack' => 'Slack', 'pager' => 'Pager'],
];
// -> name="channels[pager]"   -> ['checked' => TRUE]

// radios: every radio shares the group name.
// -> name="severity"          -> ['value' => 'critical']

// datetime: two inputs, date and time.
// -> name="started_at[date]" and name="started_at[time]"`,
      note:
        "states.js binds these selectors against the whole document, not the form — so a generic selector like :input[name=\"title[0][value]\"] can latch onto another form on the same page. Scope it when that is a risk, e.g. '#edit-incident-wrapper :input[name=\"severity\"]'. Also: with #tree and dynamic parents you cannot always hardcode the name — build it in PHP from the element's #parents so the selector can never drift.",
      leftLang: "twig",
      rightLang: "php",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A miniature Drupal.states engine in pure PHP: it walks a #states array against a snapshot of input values using exactly the rules from core/misc/states.js. Predict which states evaluate TRUE before you run it — and note the last three lines.",
    code: `<?php
// A miniature Drupal.states: evaluate a #states array against the current
// values of the inputs, the way core/misc/states.js does in the browser.
// Same rules: associative array = AND, indexed array = OR, and the string
// 'xor' anywhere in that array makes it exclusive.

$inputs = [
  'category'       => 'outage',
  'severity'       => 'critical',
  'notify_oncall'  => TRUE,   // a checkbox
  'postmortem_url' => '',     // left blank
];

// states.js State.aliases — every alias is another state, possibly inverted.
const ALIASES = [
  'unchecked' => '!checked',
  'filled'    => '!empty',
  'expanded'  => '!collapsed',
];

function checkCondition(array $condition, string $selector, array $inputs): bool {
  // ':input[name="severity"]' -> 'severity'
  $name = preg_replace('/^:input\\[name="(.+)"\\]$/', '$1', $selector);
  $value = $inputs[$name] ?? NULL;

  // Every trigger inside ONE condition array is ANDed together.
  foreach ($condition as $trigger => $expected) {
    $trigger = ALIASES[$trigger] ?? $trigger;
    $invert = str_starts_with($trigger, '!');
    $trigger = ltrim($trigger, '!');
    $actual = match ($trigger) {
      'value'   => $value === $expected,
      'checked' => (bool) $value === (bool) $expected,
      'empty'   => ($value === '' || $value === NULL) === (bool) $expected,
      default   => FALSE,
    };
    if ($invert ? $actual : !$actual) {
      return FALSE;
    }
  }
  return TRUE;
}

function verify(array $constraints, array $inputs): bool {
  if (array_is_list($constraints)) {
    // Indexed array: OR by default, XOR if the marker string is present.
    $xor = in_array('xor', $constraints, TRUE);
    $hits = 0;
    foreach ($constraints as $constraint) {
      // 'or' / 'xor' separators are strings, not constraints.
      if (is_string($constraint)) {
        continue;
      }
      $hits += verify($constraint, $inputs) ? 1 : 0;
    }
    return $xor ? $hits === 1 : $hits >= 1;
  }

  // Associative array: every selector must match (AND).
  foreach ($constraints as $selector => $condition) {
    $ok = array_is_list($condition)
      // Several conditions on ONE selector are ORed.
      ? (bool) array_filter($condition, fn($c) => checkCondition($c, $selector, $inputs))
      : checkCondition($condition, $selector, $inputs);
    if (!$ok) {
      return FALSE;
    }
  }
  return TRUE;
}

$states = [
  // AND — both selectors must match.
  'visible' => [
    ':input[name="category"]' => ['value' => 'outage'],
    ':input[name="severity"]' => ['value' => 'critical'],
  ],
  // OR — indexed array of condition arrays.
  'required' => [
    [':input[name="severity"]' => ['value' => 'critical']],
    'or',
    [':input[name="notify_oncall"]' => ['checked' => TRUE]],
  ],
  // XOR — exactly one of the two may match.
  'disabled' => [
    [':input[name="category"]' => ['value' => 'outage']],
    'xor',
    [':input[name="notify_oncall"]' => ['checked' => TRUE]],
  ],
  // Several values on one selector are ORed.
  'expanded' => [
    ':input[name="severity"]' => [['value' => 'critical'], ['value' => 'high']],
  ],
  // Inverted trigger.
  'invisible' => [
    ':input[name="postmortem_url"]' => ['!empty' => TRUE],
  ],
];

foreach ($states as $state => $constraints) {
  printf("%-9s -> %s\\n", $state, verify($constraints, $inputs) ? 'TRUE' : 'FALSE');
}

// The gotcha: 'required' evaluated TRUE in the browser, but nothing on the
// server knows that. The POST still arrives with an empty value.
echo "\\npostmortem_url submitted as: '" . $inputs['postmortem_url'] . "'\\n";
echo "#states says required: yes | server-side #required: no\\n";
echo "=> validateForm() must repeat the condition itself.\\n";`,
    output: `visible   -> TRUE
required  -> TRUE
disabled  -> FALSE
expanded  -> TRUE
invisible -> FALSE

postmortem_url submitted as: ''
#states says required: yes | server-side #required: no
=> validateForm() must repeat the condition itself.
`,
  },

  keyPoints: [
    "#states is handled by the renderer, not the Form API: `Renderer::doRender()` calls `FormHelper::processStates()`, which attaches `core/drupal.states` and JSON-encodes your array into a `data-drupal-states` attribute — so it works on any render element with attributes, and does nothing without JavaScript.",
    "States with real handlers: visible/invisible, enabled/disabled, required/optional, checked/unchecked, expanded/collapsed (open/closed), readonly/readwrite. Only four condition triggers are instrumented — value, checked, empty, collapsed — plus aliases and a leading `!` to invert.",
    "The array shape is the boolean operator: associative array of selectors = AND, indexed array of condition arrays = OR, and the literal string 'xor' inside that indexed array = exclusive OR. Several conditions on one selector also OR.",
    "`states.js` only tests for the string 'xor'; an indexed array is already OR and a stray 'or' is ignored — write it for readability, not because it does anything.",
    "Nothing is enforced server-side: a `required` state adds no validation, a field hidden by `visible` still POSTs its value, and states-`disabled` lacks the tamper protection that real `#disabled` gets from FormBuilder. Repeat every condition in `validateForm()`.",
    "Selectors match the rendered `name` attribute — `field_summary[0][value]` for delta-based field widgets (text, number, datetime) and `field_ref[0][target_id]` for an entity reference autocomplete, but a bare `field_severity` for `multiple_values` widgets (Select list, Check boxes/radio buttons), plus `contact[email]` under `#tree`, `channels[pager]` for checkboxes and `started_at[date]` for datetime. Render the form and read the HTML rather than guessing.",
  ],

  interview: [
    {
      q: "How does #states actually work under the hood, and how is that different from Symfony's form events?",
      a: "It is pure presentation. During rendering, `Renderer::doRender()` sees `#states` on an element and calls `FormHelper::processStates()`, which attaches the `core/drupal.states` library and JSON-encodes the array into a `data-drupal-states` attribute. `core/misc/states.js` then reads that attribute in the browser, binds change/keyup handlers to the selectors you named, and toggles the dependent element. Symfony's `PRE_SET_DATA`/`PRE_SUBMIT` events run on the **server** and genuinely change the form's structure and what gets validated; `#states` never touches the server round-trip. Practically that means `#states` is the right tool for progressive disclosure and the wrong tool for anything the server must trust — for structural changes you use `#ajax` with a rebuilt form instead.",
    },
    {
      q: "A colleague adds `'required' => [':input[name=\"category\"]' => ['value' => 'outage']]` and says the field is now conditionally required. What do you tell them?",
      a: "That it is conditionally required *in the browser only*. The states `required` handler adds the `required` attribute and the visual marker, but it does not set `#required` on the element and registers no server-side validation — so a POST with an empty value (curl, a disabled-JS browser, a stale tab) sails straight through. The fix is to mirror the condition in `validateForm()`: check `$form_state->getValue('category')` and call `$form_state->setErrorByName()` when the dependent value is empty. The same logic applies to `visible`: a hidden field is still in the DOM and still submits, so if the value must be discarded when the condition is false, you clear it explicitly in validate or submit.",
    },
    {
      q: "How do you express OR and AND in #states, and how do you get the selectors right on an entity form?",
      a: "The array shape carries the operator. An associative array of selectors is AND — every selector must match. An indexed array of condition arrays is OR; adding the literal string `'xor'` inside it makes the match exclusive. Multiple conditions listed against a single selector also OR, e.g. `[['value' => 'critical'], ['value' => 'high']]`. For selectors, remember `:input` is a jQuery pseudo-selector for input/select/textarea/button and the `name` must match the **rendered** HTML: a delta-based field widget on a node form gives `field_summary[0][value]` because of the delta and the column (or `field_ref[0][target_id]` for an entity reference autocomplete), while a list field on the Select list or radios widget declares `multiple_values: TRUE` and is therefore not keyed by delta at all — it renders as a bare `field_severity`. A `#tree` subform gives `contact[email]`, a `checkboxes` element gives one name per option like `channels[pager]`, and a `datetime` element renders `started_at[date]` and `started_at[time]`. I render the form and read the markup rather than guessing — and I scope the selector with a wrapper when the same field name could appear twice on a page.",
    },
    {
      q: "When would you choose #ajax over #states?",
      a: "When the server has to be involved. `#states` can only show, hide, enable, disable, require, check or collapse elements that are **already** in the built form — it cannot fetch options, recalculate a value, or add an element that was not rendered. So if selecting a category should repopulate a service dropdown from the database, that's `#ajax` with a callback that rebuilds and returns the subtree. If selecting a category should simply reveal a date field that was already there, that's `#states` — no request, no wrapper, no rebuild, and instant response. There's also a security angle: because `#ajax` rebuilds the form server-side, the server's view of the form matches what the user sees, which `#states` never guarantees.",
    },
  ],

  quiz: [
    {
      question:
        "Which core component turns a `#states` array into something the browser can use?",
      options: [
        "FormBuilder::doBuildForm(), during form construction",
        "Renderer::doRender(), which calls FormHelper::processStates()",
        "hook_form_alter(), invoked by the FormBuilder",
        "The #process callback on each form element",
      ],
      answerIndex: 1,
      explain:
        "`#states` is a render-layer feature, not a Form API feature. `Renderer::doRender()` checks for `#states` and calls `FormHelper::processStates()`, which attaches `core/drupal.states` and JSON-encodes the array into a `data-drupal-states` attribute. That's why `#states` works on non-form render elements too.",
    },
    {
      question:
        "You write `'visible' => [[':input[name=\"a\"]' => ['checked' => TRUE]], 'or', [':input[name=\"b\"]' => ['checked' => TRUE]]]`. What does states.js do with the string 'or'?",
      options: [
        "It switches the array from AND to OR evaluation",
        "It throws a JavaScript error — only 'xor' is valid",
        "Nothing: an indexed array is already OR, and 'or' is skipped as unresolvable",
        "It makes the match exclusive, like 'xor'",
      ],
      answerIndex: 2,
      explain:
        "`verifyConstraints()` in core/misc/states.js tests only for the string `'xor'`. An indexed array is OR by default; a stray `'or'` string falls through to `checkConstraints()`, resolves to `undefined`, and is treated as a non-match. Keep writing it — it documents intent for the next reader — but it isn't what makes the OR happen.",
    },
    {
      question:
        "A field has `'required' => [':input[name=\"category\"]' => ['value' => 'outage']]` and nothing else. A POST arrives with category=outage and the field empty. What happens?",
      options: [
        "Drupal rejects the submission with a 'field is required' error",
        "The form rebuilds via #ajax and shows the error inline",
        "The submission is accepted — #states adds no server-side validation",
        "FormBuilder replaces the value with the element's #default_value",
      ],
      answerIndex: 2,
      explain:
        "The `required` state only adds the HTML attribute and the visual marker client-side. It does not set `#required` and registers no validator, so the empty value is accepted. You must repeat the condition in `validateForm()` with `$form_state->getValue()` and `setErrorByName()`. (The last option describes real `#disabled`, which states-`disabled` does not give you.)",
    },
    {
      question:
        "On a node form, a single-value `list_string` field `field_severity` rendered with the default Select list widget (`options_select`) should control another element. Which selector is correct?",
      options: [
        "`:input[name=\"field_severity\"]`",
        "`:input[name=\"field_severity[0][value]\"]`",
        "`:input[name=\"node[field_severity]\"]`",
        "`#edit-field-severity`",
      ],
      answerIndex: 0,
      explain:
        "`options_select` and `options_buttons` both declare `multiple_values: TRUE`, so `WidgetBase::form()` takes the branch that does NOT key the element by delta — it just sets `'#parents' => array_merge($parents, [$field_name])`, giving `name=\"field_severity\"` (`field_severity[]` when cardinality is greater than 1). The `[0][value]` shape is real, but only for delta-based widgets: `field_summary[0][value]` for a plain text field, `field_ref[0][target_id]` for an entity reference autocomplete. Entity forms are not prefixed with the entity type the way Symfony prefixes with the form's block name, and the wrapper id `#edit-field-severity` matches a `<div>`, not an input, so states.js has no value to read — always match the rendered `name` attribute.",
    },
  ],
};

export default lesson;
