import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "validation-constraints",
  title: "Custom Validation Constraints",
  part: "Forms & Config",
  estMinutes: 12,
  summary:
    "Write a Constraint plugin + ConstraintValidator for incident severity — Symfony Validator is Drupal's validation engine, so your Assert\\* knowledge transfers, but registration is a plugin attached by ID, not an attribute on a property.",

  concept: `
## Same engine, different registration

Peel back Drupal's Entity Validation API and you find the Symfony Validator
component you already know: \`Constraint\` classes paired with
\`ConstraintValidator\`s, violations collected on an execution context, a
\`ConstraintViolationList\` at the end. Your \`Assert\\*\` intuition carries
straight over. What changes is **registration and attachment**: in Symfony a
custom constraint is a PHP attribute you place on a property; in Drupal fields
are not class properties — they're typed-data definitions built at runtime —
so a constraint is a **plugin** you attach by ID.

## The plugin pair

Two classes in \`src/Plugin/Validation/Constraint/\`:

- \`IncidentSeverityRangeConstraint\` extends
  \`Symfony\\Component\\Validator\\Constraint\` and carries the message plus
  options as public properties. Discovery is via
  \`#[Constraint(id: 'IncidentSeverityRange', label: ...)]\` — Drupal's own
  attribute from \`Drupal\\Core\\Validation\\Attribute\\Constraint\`
  (constraint plugins gained attribute discovery in **10.3**; older 10.x uses
  the \`@Constraint\` annotation in a doc block).
- \`IncidentSeverityRangeConstraintValidator\` — located by Symfony's default
  \`validatedBy()\` convention: constraint class name + \`Validator\`. Its
  \`validate()\` calls \`$this->context->addViolation()\` or
  \`buildViolation()\`, exactly as in Symfony. Drupal builds validators
  through the class resolver, so implement \`ContainerInjectionInterface\`
  with a \`create()\` method when the validator needs services.

One field-level wrinkle: attach a constraint to a *field* and \`$value\`
inside \`validate()\` is the whole \`FieldItemListInterface\`, not a scalar —
loop the items and use \`atPath((string) $delta)\` so each violation lands on
the right delta.

## Attaching it

- **Your own entity**: \`->addConstraint('IncidentSeverityRange', ['min' => 1,
  'max' => 5])\` in \`baseFieldDefinitions()\`. The options array is mapped
  onto the constraint's public properties by Symfony's constructor.
- **Reuse without a plugin**: \`->addPropertyConstraints('value', ['Range' =>
  ['min' => 1, 'max' => 5]])\` targets one item property with any existing
  core/Symfony constraint plugin.
- **Entities you don't own**: \`hook_entity_base_field_info_alter()\` — in
  D11.1+ this can live as a \`#[Hook('entity_base_field_info_alter')]\` method
  on your OOP hook class.
- **Cross-field rules**: \`hook_entity_type_alter()\` plus
  \`$entity_types['incident']->addConstraint(...)\`; the constraint's
  attribute then declares \`type: 'entity:incident'\` and its validator
  receives the whole entity.

## The three validation layers

A module dev juggles three layers, and picking the wrong one is a classic
code-review comment:

1. **Form validation** (\`validateForm()\`, \`#element_validate\`) — UI only.
   REST, JSON:API, migrations and programmatic saves never run it. Use it for
   form-specific UX (comparing two widgets, wizard steps).
2. **Entity constraints** — fire on \`$entity->validate()\`, which entity
   forms call for you and REST/JSON:API call on POST/PATCH. Business rules
   belong here so *every* write path enforces them. Sharp edge: a bare
   \`$entity->save()\` does **not** validate — importers, queue workers and
   drush scripts must call \`validate()\` themselves.
3. **Config schema constraints** — \`constraints:\` keys in
   \`config/schema/*.schema.yml\` validate configuration values (enforced by
   \`#config_target\` in ConfigFormBase since 10.2). Right place for settings,
   wrong place for entity data.

Rule of thumb: if the rule must hold no matter how the data arrives, it's an
entity constraint. If it only makes sense inside one form, it's form
validation.
`,

  comparisons: [
    {
      label: "Declaring the constraint",
      intro:
        "Both sides extend the same Symfony Constraint base class. Symfony's class IS a PHP attribute you put on properties; Drupal's is a plugin whose #[Constraint] attribute exists purely for discovery — you attach it by ID later.",
      php: `// Symfony: src/Validator/SeverityRange.php — a PHP attribute
// you will place directly ON a property. Autoconfiguration tags
// the validator (validator.constraint_validator) automatically.
namespace App\\Validator;

use Symfony\\Component\\Validator\\Constraint;

#[\\Attribute(\\Attribute::TARGET_PROPERTY)]
class SeverityRange extends Constraint
{
    public string $message = 'Severity {{ value }} must be between {{ min }} and {{ max }}.';

    public function __construct(
        public int $min = 1,
        public int $max = 5,
        ?array $groups = null,
        mixed $payload = null,
    ) {
        parent::__construct([], $groups, $payload);
    }
}`,
      ts: `// Drupal: src/Plugin/Validation/Constraint/
//               IncidentSeverityRangeConstraint.php
// A PLUGIN. #[Constraint] is Drupal's DISCOVERY attribute
// (10.3+; older 10.x uses an @Constraint annotation instead).
namespace Drupal\\incident_tracker\\Plugin\\Validation\\Constraint;

use Drupal\\Core\\StringTranslation\\TranslatableMarkup;
use Drupal\\Core\\Validation\\Attribute\\Constraint;
use Symfony\\Component\\Validator\\Constraint as SymfonyConstraint;

#[Constraint(
  id: 'IncidentSeverityRange',
  label: new TranslatableMarkup('Incident severity range', [], ['context' => 'Validation']),
)]
class IncidentSeverityRangeConstraint extends SymfonyConstraint {

  public string $message = 'Severity %value is out of range %min-%max.';

  public int $min = 1;

  public int $max = 5;

}`,
      note:
        "Drupal's #[Constraint] does NOT make the class usable as a PHP attribute on properties — it registers a plugin ID. The options you later pass to addConstraint('IncidentSeverityRange', [...]) are mapped onto the public properties by Symfony's Constraint constructor.",
    },
    {
      label: "The validator — this code barely changes",
      intro:
        "Same ConstraintValidator base class, same $this->context API. The differences: Drupal finds the class by naming convention, and a field-level constraint receives the whole field item list, not a scalar.",
      php: `// Symfony: $value is the property's raw value.
namespace App\\Validator;

use Symfony\\Component\\Validator\\Constraint;
use Symfony\\Component\\Validator\\ConstraintValidator;
use Symfony\\Component\\Validator\\Exception\\UnexpectedTypeException;

class SeverityRangeValidator extends ConstraintValidator
{
    public function validate(mixed $value, Constraint $constraint): void
    {
        if (!$constraint instanceof SeverityRange) {
            throw new UnexpectedTypeException($constraint, SeverityRange::class);
        }
        if ($value === null) {
            return; // let NotBlank handle empties
        }
        if ($value < $constraint->min || $value > $constraint->max) {
            $this->context->buildViolation($constraint->message)
                ->setParameter('{{ value }}', (string) $value)
                ->setParameter('{{ min }}', (string) $constraint->min)
                ->setParameter('{{ max }}', (string) $constraint->max)
                ->addViolation();
        }
    }
}`,
      ts: `// Drupal: found by NAMING CONVENTION — the constraint class
// name + 'Validator' (Symfony's default validatedBy()).
// Field-level constraint => $items is the FieldItemList.
namespace Drupal\\incident_tracker\\Plugin\\Validation\\Constraint;

use Symfony\\Component\\Validator\\Constraint;
use Symfony\\Component\\Validator\\ConstraintValidator;

class IncidentSeverityRangeConstraintValidator extends ConstraintValidator {

  public function validate(mixed $items, Constraint $constraint): void {
    foreach ($items as $delta => $item) {
      $value = (int) $item->value;
      if ($value < $constraint->min || $value > $constraint->max) {
        $this->context->buildViolation($constraint->message)
          ->setParameter('%value', (string) $value)
          ->setParameter('%min', (string) $constraint->min)
          ->setParameter('%max', (string) $constraint->max)
          ->atPath((string) $delta)
          ->addViolation();
      }
    }
  }

}`,
      note:
        "Need services in the validator? Drupal instantiates it through the class resolver, so implement ContainerInjectionInterface with a create() method — the constructor-autowiring you'd get for free in Symfony is explicit here.",
    },
    {
      label: "Attaching the constraint",
      intro:
        "Symfony: decorate the property. Drupal: fields are runtime definitions, so you attach by plugin ID — to your own base fields, to entities you don't own via an alter hook, or to the whole entity for cross-field rules.",
      php: `// Symfony: the constraint sits ON the property it validates.
namespace App\\Entity;

use App\\Validator\\SeverityRange;
use Symfony\\Component\\Validator\\Constraints as Assert;

class Incident
{
    #[Assert\\NotBlank]
    #[Assert\\Length(max: 120)]
    public string $title = '';

    #[SeverityRange(min: 1, max: 5)]
    public int $severity = 3;
}`,
      ts: `// Drupal: in Incident::baseFieldDefinitions() — attach by ID.
$fields['severity'] = BaseFieldDefinition::create('integer')
  ->setLabel(t('Severity'))
  ->setRequired(TRUE)
  ->addConstraint('IncidentSeverityRange', ['min' => 1, 'max' => 5]);

// Reuse existing constraint plugins on one item property —
// no custom plugin needed:
$fields['title'] = BaseFieldDefinition::create('string')
  ->setLabel(t('Title'))
  ->setRequired(TRUE)
  ->addPropertyConstraints('value', ['Length' => ['max' => 120]]);

// Fields you DON'T own: an alter hook in incident_tracker.module
// (or a #[Hook('entity_base_field_info_alter')] method in D11.1+).
function incident_tracker_entity_base_field_info_alter(
  array &$fields,
  \\Drupal\\Core\\Entity\\EntityTypeInterface $entity_type,
): void {
  if ($entity_type->id() === 'user') {
    // On-call users must keep a mail address for paging.
    $fields['mail']->addConstraint('NotNull');
  }
}

// Cross-field rules: constrain the WHOLE entity. The constraint's
// attribute then declares type: 'entity:incident'.
function incident_tracker_entity_type_alter(array &$entity_types): void {
  $entity_types['incident']->addConstraint('IncidentEscalationWindow');
}`,
      note:
        "addConstraint() on the field definition validates the item list (your validator loops items); addPropertyConstraints('value', ...) targets one property inside each item — that's how you reuse core's Length/Range/AllowedValues without writing anything.",
    },
    {
      label: "Running validation — and the save() gotcha",
      intro:
        "Symfony makes you call the validator service explicitly, so you never forget. Drupal validates inside entity forms and REST/JSON:API automatically — which lulls people into thinking save() validates. It does not.",
      php: `// Symfony: inject the validator, call it, then persist.
public function __construct(
    private ValidatorInterface $validator,
    private EntityManagerInterface $em,
    private LoggerInterface $logger,
) {}

public function import(array $row): void
{
    $incident = Incident::fromRow($row);

    $violations = $this->validator->validate($incident);
    if (count($violations) > 0) {
        foreach ($violations as $violation) {
            $this->logger->warning('{path}: {message}', [
                'path' => $violation->getPropertyPath(),
                'message' => (string) $violation->getMessage(),
            ]);
        }
        return;
    }

    $this->em->persist($incident);
    $this->em->flush();
}`,
      ts: `// Drupal: the entity carries its own validate(). Entity forms
// and REST/JSON:API call it FOR you — $entity->save() does NOT,
// so importers and queue workers must call it themselves.
public function import(array $row): void {
  $incident = $this->entityTypeManager
    ->getStorage('incident')
    ->create([
      'title' => $row['title'],
      'severity' => (int) $row['severity'],
    ]);

  $violations = $incident->validate();
  if ($violations->count() > 0) {
    foreach ($violations as $violation) {
      $this->logger->warning('@path: @message', [
        '@path' => $violation->getPropertyPath(),
        '@message' => (string) $violation->getMessage(),
      ]);
    }
    return;
  }

  $incident->save();
}`,
      note:
        "This is why entity constraints beat validateForm() for business rules: the form layer, REST and JSON:API all funnel through $entity->validate(), so one plugin guards every write path — as long as programmatic code remembers to call it before save().",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "The whole constraint machine in plain PHP: a plugin registry (what #[Constraint] discovery builds), validators resolved by the class-name-plus-Validator convention, and a shared context collecting violations across fields. Two incident drafts get validated — predict both results, then run.",
    code: `<?php
// Simulate Drupal's constraint plugin machinery: a registry maps plugin IDs
// to constraint classes (what #[Constraint] discovery builds), and
// $entity->validate() walks each field's constraints, resolving every
// validator by the Symfony naming convention and sharing ONE context.

class ExecutionContext {
    private array $violations = [];
    public string $path = '';

    // The real API: $this->context->addViolation($message, $placeholders).
    public function addViolation(string $template, array $params = []): void {
        $this->violations[] = [
            'path'    => $this->path,
            'message' => strtr($template, $params),
        ];
    }

    public function violations(): array {
        return $this->violations;
    }
}

// --- Constraint "plugins" — discovery would find these by #[Constraint]. ---

class IncidentSeverityRangeConstraint {
    public string $message = 'Severity %value is out of range %min-%max.';
    public int $min = 1;
    public int $max = 5;

    public function __construct(array $options = []) {
        // Symfony's Constraint base class maps options onto public props.
        foreach ($options as $name => $value) {
            $this->$name = $value;
        }
    }
}

class IncidentSeverityRangeConstraintValidator {
    public function __construct(private ExecutionContext $context) {}

    public function validate(mixed $value, object $constraint): void {
        if ($value < $constraint->min || $value > $constraint->max) {
            $this->context->addViolation($constraint->message, [
                '%value' => $value,
                '%min'   => $constraint->min,
                '%max'   => $constraint->max,
            ]);
        }
    }
}

class NotBlankConstraint {
    public string $message = 'This value should not be blank.';

    public function __construct(array $options = []) {}
}

class NotBlankConstraintValidator {
    public function __construct(private ExecutionContext $context) {}

    public function validate(mixed $value, object $constraint): void {
        if ($value === '' || $value === null) {
            $this->context->addViolation($constraint->message);
        }
    }
}

// The ID => class map the constraint plugin manager builds at discovery.
$registry = [
    'IncidentSeverityRange' => IncidentSeverityRangeConstraint::class,
    'NotBlank'              => NotBlankConstraint::class,
];

// What baseFieldDefinitions() declared:
//   ->addConstraint('NotBlank') and
//   ->addConstraint('IncidentSeverityRange', ['min' => 1, 'max' => 5])
$fieldConstraints = [
    'title'    => [['NotBlank', []]],
    'severity' => [['IncidentSeverityRange', ['min' => 1, 'max' => 5]]],
];

function validateIncident(array $values, array $fieldConstraints, array $registry): array {
    $context = new ExecutionContext();
    foreach ($fieldConstraints as $field => $constraints) {
        $context->path = $field;
        foreach ($constraints as [$id, $options]) {
            $constraintClass = $registry[$id];
            $constraint = new $constraintClass($options);
            // Symfony's default validatedBy(): class name + 'Validator'.
            $validatorClass = $constraintClass . 'Validator';
            (new $validatorClass($context))->validate($values[$field], $constraint);
        }
    }
    return $context->violations();
}

$drafts = [
    ['title' => '', 'severity' => 9],
    ['title' => 'DB replica lag on prod', 'severity' => 2],
];

foreach ($drafts as $i => $values) {
    echo "\\$incident->validate() on draft #" . ($i + 1) . ":\\n";
    $violations = validateIncident($values, $fieldConstraints, $registry);
    echo "  " . count($violations) . " violation(s)\\n";
    foreach ($violations as $v) {
        echo "  - [" . $v['path'] . "] " . $v['message'] . "\\n";
    }
    echo $violations === [] ? "  -> safe to save()\\n" : "  -> reject the save, flag the fields\\n";
    echo "\\n";
}
echo "Same constraints fire for the entity form, REST and JSON:API.\\n";`,
    output: `$incident->validate() on draft #1:
  2 violation(s)
  - [title] This value should not be blank.
  - [severity] Severity 9 is out of range 1-5.
  -> reject the save, flag the fields

$incident->validate() on draft #2:
  0 violation(s)
  -> safe to save()

Same constraints fire for the entity form, REST and JSON:API.`,
  },

  keyPoints: [
    "Drupal's entity validation IS Symfony Validator: the same Constraint + ConstraintValidator pair, the same $this->context->addViolation()/buildViolation() API — only registration differs.",
    "A custom constraint is a plugin in src/Plugin/Validation/Constraint/, marked #[Constraint(id: ..., label: ...)] using Drupal\\Core\\Validation\\Attribute\\Constraint (10.3+; @Constraint annotation on older 10.x) — the attribute is discovery metadata, not something you put on properties.",
    "The validator is found by Symfony's validatedBy() convention (constraint class + 'Validator') and built via the class resolver — implement ContainerInjectionInterface when it needs injected services.",
    "Attach by ID: ->addConstraint('IncidentSeverityRange', $options) in baseFieldDefinitions(), ->addPropertyConstraints('value', ...) to reuse existing plugins, hook_entity_base_field_info_alter() for entities you don't own, and hook_entity_type_alter() + type: 'entity:incident' for cross-field rules.",
    "A field-level constraint's validate() receives the whole FieldItemList — loop items and use atPath((string) $delta) to pin violations to the right delta.",
    "Three layers, three jobs: validateForm() is UI-only; entity constraints fire on $entity->validate() (entity forms, REST, JSON:API — but NOT bare $entity->save()); config schema constraints: keys validate settings, enforced via #config_target since 10.2.",
  ],

  interview: [
    {
      q: "How does Drupal's entity validation relate to the Symfony Validator component?",
      a: "It's not 'similar to' Symfony Validator — it *is* Symfony Validator: Drupal's typed-data layer runs the same component, constraints extend `Symfony\\Component\\Validator\\Constraint`, validators extend `ConstraintValidator` and call `$this->context->addViolation()`. What Drupal adds is a plugin layer for registration: constraints are discovered by the `#[Constraint]` attribute (or `@Constraint` annotation pre-10.3) and attached to field definitions by plugin ID rather than being PHP attributes placed on class properties, because Drupal fields are runtime typed-data definitions, not properties. Violations come back as a familiar `ConstraintViolationList` from `$entity->validate()`. So a Symfony developer's validator knowledge transfers almost line for line — the interview-worthy detail is knowing where the registration and attachment differ.",
    },
    {
      q: "Walk me through adding a custom validation rule to a field on a custom entity.",
      a: "Two classes in `src/Plugin/Validation/Constraint/`: a constraint class extending Symfony's `Constraint` with the `#[Constraint(id: 'IncidentSeverityRange', label: ...)]` attribute and public properties for the message and options, plus a validator named with the `Validator` suffix so Symfony's default `validatedBy()` finds it. The validator's `validate()` receives the field item list (for field-level attachment), loops the items, and calls `$this->context->buildViolation(...)->atPath((string) $delta)->addViolation()` for bad values. Attach it in `baseFieldDefinitions()` with `->addConstraint('IncidentSeverityRange', ['min' => 1, 'max' => 5])` — the options map onto the constraint's public properties. For entities the module doesn't own, attach in `hook_entity_base_field_info_alter()`; for cross-field rules, add an entity-level constraint via `hook_entity_type_alter()` with `type: 'entity:incident'` in the attribute.",
    },
    {
      q: "When would you use form validation versus an entity constraint, and what's the classic mistake?",
      a: "Form `validateForm()` only runs for that specific form, so it's for UI-level concerns — cross-widget checks, wizard flow, friendlier messaging. Entity constraints run wherever `$entity->validate()` is called: entity forms call it automatically, and REST/JSON:API run it on POST/PATCH, so any rule that's actually a business invariant ('severity must be 1-5') belongs there — otherwise an API client can write data your form would have rejected. The classic mistake has two halves: putting business rules only in `validateForm()` (bypassed by every non-form write path), and assuming `$entity->save()` validates — it doesn't, so importers, queue workers and drush scripts must call `validate()` explicitly and check the violation list before saving. Config values are the third layer: they're validated by `constraints:` in the config schema, not by entity constraints.",
    },
  ],

  quiz: [
    {
      question:
        "A rule like 'severity must be between 1 and 5' must also hold for JSON:API PATCH requests. Where does it belong?",
      options: [
        "In the entity form's validateForm() method",
        "In a #element_validate callback on the severity widget",
        "In an entity validation constraint attached to the field definition",
        "In the module's config schema file",
      ],
      answerIndex: 2,
      explain:
        "Form-level validation (validateForm, #element_validate) only runs for that form — JSON:API, REST and programmatic code never touch it. Entity constraints fire on $entity->validate(), which entity forms AND the REST/JSON:API layers all call, so one plugin guards every write path. Config schema validates configuration objects, not entity data.",
    },
    {
      question:
        "You attach a constraint with ->addConstraint('IncidentSeverityRange') on a base field definition. What is $value inside the validator's validate() method?",
      options: [
        "The raw scalar value of the field",
        "The whole FieldItemList for that field",
        "The parent entity object",
        "The FormStateInterface of the submitting form",
      ],
      answerIndex: 1,
      explain:
        "Field-level constraints validate the field item list, so the validator receives the FieldItemListInterface and should loop the items, using atPath((string) $delta) to attach each violation to the right delta. To validate a single property scalar instead, attach with addPropertyConstraints('value', [...]). The entity is what entity-level constraints (type: 'entity:...') receive.",
    },
    {
      question:
        "A queue worker builds an incident entity from an external payload and calls $incident->save(). Which constraints run?",
      options: [
        "All entity constraints, because save() always validates first",
        "None — save() does not trigger validation; the worker must call $incident->validate() itself",
        "Only constraints added via addPropertyConstraints()",
        "Only the constraints on required fields",
      ],
      answerIndex: 1,
      explain:
        "Unlike entity forms and REST/JSON:API, which call $entity->validate() before saving, a bare $entity->save() performs no constraint validation at all. Programmatic write paths — importers, queue workers, drush scripts — must call validate(), check the returned violation list, and only then save. Forgetting this is one of the most common Drupal data-integrity bugs.",
    },
    {
      question:
        "How does Drupal locate the validator class for the IncidentSeverityRangeConstraint plugin?",
      options: [
        "From a 'validator' key in the #[Constraint] attribute",
        "From a tagged service definition in incident_tracker.services.yml",
        "By Symfony's default validatedBy(): the constraint class name with a 'Validator' suffix, in the same namespace",
        "By scanning for any class implementing ConstraintValidatorInterface in the module",
      ],
      answerIndex: 2,
      explain:
        "Drupal reuses Symfony's convention: Constraint::validatedBy() defaults to the constraint's class name plus 'Validator', so IncidentSeverityRangeConstraint resolves to IncidentSeverityRangeConstraintValidator. No service tag is needed (that's the Symfony-app registration); Drupal instantiates the class via the class resolver, which is why ContainerInjectionInterface enables dependency injection.",
    },
  ],
};

export default lesson;
