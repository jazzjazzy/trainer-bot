import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "coding-standards-static-analysis",
  title: "Coding Standards: phpcs, Drupal Standard & PHPStan",
  part: "Polish & Ship",
  estMinutes: 13,
  summary:
    "Wire the same tools you already run in Symfony — phpcs and PHPStan — to Drupal-flavored rulesets: drupal/coder's Drupal + DrupalPractice standards with phpcbf auto-fix, phpstan-drupal for container- and entity-aware analysis, a baseline to ratchet legacy code, and deprecation scanning so incident_tracker is Drupal 11 ready.",

  concept: `
## Same tools, different rulebook

Nothing here is new machinery — it is phpcs and PHPStan, the two binaries you
already run on a Symfony app. What changes is the ruleset: Drupal ships its own
opinionated standard, and PHPStan needs an extension before it understands
what \\Drupal::entityTypeManager() hands back. Budget a week of muscle-memory
pain for the two-space indent.

### Coder: the Drupal and DrupalPractice standards

\`composer require --dev drupal/coder\` pulls in
\`squizlabs/php_codesniffer\` plus the
\`dealerdirect/phpcodesniffer-composer-installer\` plugin, which registers two
standards with phpcs (allow the plugin in \`composer.json\` or it silently does
nothing — check with \`vendor/bin/phpcs -i\`):

- **Drupal** — formatting and documentation. Two-space indent and no tabs;
  opening braces on the *same* line as the class/function (not PSR-12's next
  line); \`else\` on its own line after the closing brace; \`TRUE\`, \`FALSE\`
  and \`NULL\` uppercase; short \`[]\` arrays only (the \`array()\` argument was
  settled in Drupal 8); a docblock on every class, method and hook with typed
  \`@param\`/\`@return\` lines; comments that end in a full stop; an 80-column
  soft limit on comments; a blank line after a class's opening brace and before
  its closing brace; and no closing \`?>\` tag.
- **DrupalPractice** — API misuse, mostly warnings: \`\\Drupal::\` calls inside
  a class that could inject the service, \`t()\` inside exception messages,
  unused variables, config schema disabled in tests.

Run both, then let the fixer do the boring half:

\`\`\`bash
vendor/bin/phpcs --standard=Drupal,DrupalPractice web/modules/custom/incident_tracker
vendor/bin/phpcbf --standard=Drupal web/modules/custom/incident_tracker
\`\`\`

Commit a \`phpcs.xml.dist\` in the module root so everyone (and CI) inherits the
same standards and file extensions — \`.module\`, \`.install\` and \`.theme\`
are not scanned unless you list them.

### PHPStan that knows Drupal

Vanilla PHPStan cannot even autoload \`incident_tracker.module\`. Add
\`mglaman/phpstan-drupal\` and \`phpstan/phpstan-deprecation-rules\`, include
their \`.neon\` files, and point \`drupal.drupal_root\` at your web root. You
then get: hook and \`.module\` file autoloading; real return types for
\`\$this->entityTypeManager->getStorage('node')\` (a \`NodeStorage\`, so
\`->load()\` returns a \`Node\`) and for \`\\Drupal::service()\` ids; and an
error every time you call a core API marked \`@deprecated\`. Level 0-9 as
usual — contrib often starts at 1, custom code should aim for 5-6 and climb.

### Baselines beat big-bang cleanups

Inheriting a messy module? Do not fix 900 errors before you can use the tool.
Run \`vendor/bin/phpstan analyse --generate-baseline\`, commit the resulting
\`phpstan-baseline.neon\`, and include it. Existing errors are frozen; new code
is held to the level. Shrink the baseline as you touch files. phpcs has the
same escape hatch via \`--warning-severity=0\` while you clear the errors first.

### Drupal 10 to 11 readiness

Deprecation rules catch most of it in your own code. The \`upgrade_status\`
contrib module catches the rest — \`core_version_requirement\` in
\`.info.yml\`, deprecated core modules, environment checks —
via \`drush upgrade_status:analyze incident_tracker\` or
**Reports > Upgrade status**. \`drupal-check\` was the old wrapper around the
same PHPStan stack and is effectively superseded; \`palantirnet/drupal-rector\`
can auto-rewrite many deprecated calls. Wire phpcs and phpstan as composer
scripts now; the deployment course turns them into CI gates.
`,

  comparisons: [
    {
      label: "Installing the linter: PHP-CS-Fixer vs Coder + phpcs",
      intro:
        "Both ecosystems bolt a style checker onto Composer. Symfony reaches for PHP-CS-Fixer and its @Symfony ruleset; Drupal reaches for drupal/coder, which is a Composer package of phpcs sniffs — not a module you install in the site UI.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: PHP-CS-Fixer, configured by .php-cs-fixer.dist.php.
composer require --dev friendsofphp/php-cs-fixer

# Preview, then apply — @Symfony = PSR-12 + Symfony conventions,
# so 4-space indent and braces on their own line.
vendor/bin/php-cs-fixer fix --dry-run --diff
vendor/bin/php-cs-fixer fix

# Static analysis needs no extension for plain PHP:
composer require --dev phpstan/phpstan
vendor/bin/phpstan analyse src --level=8`,
      ts: `# Drupal: Coder ships the Drupal + DrupalPractice sniffs.
composer require --dev drupal/coder

# The installer plugin must be allowed or the standards
# never register (a classic "why does phpcs say Drupal is
# not installed" moment):
composer config --no-plugins \\
  allow-plugins.dealerdirect/phpcodesniffer-composer-installer true

vendor/bin/phpcs -i
# ... The installed coding standards are MySource, PEAR, PSR1,
#     PSR2, PSR12, Squiz, Zend, Drupal and DrupalPractice

vendor/bin/phpcs --standard=Drupal,DrupalPractice \\
  --extensions=php,module,inc,install,test,profile,theme,info,yml \\
  web/modules/custom/incident_tracker

# Fix the mechanical half (indent, array(), TRUE/FALSE/NULL):
vendor/bin/phpcbf --standard=Drupal web/modules/custom/incident_tracker`,
      note:
        "Without --extensions (or a phpcs.xml.dist that sets it) phpcs only reads .php files — your .module, .install and .theme files go unchecked. Coder is a dev dependency, never a module you enable on the site.",
    },
    {
      label: "The same class, @Symfony ruleset vs the Drupal standard",
      intro:
        "One service, formatted for each house style. Everything on the right is enforceable by a sniff — this is the shape reviewers on drupal.org expect, and the shape phpcbf will push your code toward.",
      php: `<?php

declare(strict_types=1);

namespace App\\Service;

use Psr\\Log\\LoggerInterface;

final class IncidentSync
{
    public function __construct(
        private readonly LoggerInterface $logger,
    ) {
    }

    public function countOpen(array $rows): int
    {
        $count = 0;
        foreach ($rows as $row) {
            if ($row['closed'] === true) {
                continue;
            } else {
                ++$count;
            }
        }

        return $count;
    }
}`,
      ts: `<?php

namespace Drupal\\incident_tracker;

use Psr\\Log\\LoggerInterface;

/**
 * Syncs incidents from the monitoring API.
 */
class IncidentSync {

  /**
   * Constructs an IncidentSync object.
   *
   * @param \\Psr\\Log\\LoggerInterface $logger
   *   The incident_tracker logger channel.
   */
  public function __construct(
    protected readonly LoggerInterface $logger,
  ) {}

  /**
   * Counts the incidents that are still open.
   *
   * @param array $rows
   *   Rows returned by the monitoring API.
   *
   * @return int
   *   The number of open incidents.
   */
  public function countOpen(array $rows): int {
    $count = 0;
    foreach ($rows as $row) {
      if ($row['closed'] === TRUE) {
        continue;
      }
      else {
        $count++;
      }
    }
    return $count;
  }

}`,
      note:
        "Differences a sniff will flag: 2-space indent, braces on the SAME line, else on its own line, uppercase TRUE/FALSE/NULL, a docblock on every class and public method with a typed @param whose description sits on the next line, a blank line after the class opening brace and before the closing one. declare(strict_types=1) is allowed (core adds it to new 11.x files) but not required.",
    },
    {
      label: "Static analysis config: phpstan.neon, with and without Drupal",
      intro:
        "Same file format, same levels. The Drupal side adds two includes: the phpstan-drupal extension (bootstrapping, container and entity-storage return types) and the deprecation rules, plus a drupal_root so the extension can find core.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# phpstan.neon -- vanilla Symfony project
includes:
    - vendor/phpstan/phpstan-symfony/extension.neon
    - vendor/phpstan/phpstan-doctrine/extension.neon

parameters:
    level: 8
    paths:
        - src
    symfony:
        containerXmlPath: var/cache/dev/App_KernelDevDebugContainer.xml

# vendor/bin/phpstan analyse
# vendor/bin/phpstan analyse --generate-baseline`,
      ts: `# phpstan.neon at the PROJECT root (not the module root)
includes:
  - vendor/mglaman/phpstan-drupal/extension.neon
  - vendor/phpstan/phpstan-deprecation-rules/rules.neon
  - phpstan-baseline.neon

parameters:
  level: 6
  paths:
    - web/modules/custom/incident_tracker
  excludePaths:
    - */tests/fixtures/*
  drupal:
    drupal_root: web
  ignoreErrors:
    # Hook signatures we do not control.
    - '#^Function incident_tracker_form_alter\\(\\) has parameter \\$form with no value type specified in iterable type array\\.$#'

# composer require --dev mglaman/phpstan-drupal phpstan/phpstan-deprecation-rules
# vendor/bin/phpstan analyse`,
      note:
        "With the extension, $this->entityTypeManager->getStorage('node') is typed as NodeStorage so ->load() returns a Node — PHPStan can then check your field access. Without it you get mixed, and half your findings are noise about Drupal's own globals.",
    },
    {
      label: "Deprecation scanning for the Drupal 10 to 11 jump",
      intro:
        "Symfony surfaces deprecations at runtime (profiler, PHPUnit bridge) because you upgrade minor by minor. Drupal's major jump is a one-off audit: scan statically, then confirm with the upgrade_status module, which also checks metadata your linter never reads.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: deprecations are runtime signals.
SYMFONY_DEPRECATIONS_HELPER='max[total]=0' vendor/bin/phpunit
php bin/console debug:container --deprecations

# Then rewrite what Rector can:
composer require --dev rector/rector
vendor/bin/rector process src --dry-run`,
      ts: `# 1. Static: deprecation rules flag every call to an
#    @deprecated core API from your module.
vendor/bin/phpstan analyse web/modules/custom/incident_tracker
#  ------ ------------------------------------------------------
#   Line   incident_tracker.module
#  ------ ------------------------------------------------------
#   42     Call to deprecated function watchdog_exception():
#          in drupal:10.1.0 and is removed from drupal:11.0.0.
#          Use Error::logException() instead.

# 2. Readiness report: also checks .info.yml
#    core_version_requirement, deprecated core modules, Twig.
composer require --dev drupal/upgrade_status
drush pm:install upgrade_status
drush upgrade_status:analyze incident_tracker
#    UI: /admin/reports/upgrade-status

# 3. Auto-rewrite the mechanical deprecations.
composer require --dev palantirnet/drupal-rector
cp vendor/palantirnet/drupal-rector/rector.php .
vendor/bin/rector process web/modules/custom/incident_tracker --dry-run`,
      note:
        "drupal-check was the old CLI wrapper around this same PHPStan stack and is no longer the recommended route — run phpstan-drupal directly. upgrade_status is a real Drupal module you install and uninstall, so keep it out of production config.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A miniature phpcs: six sniffs over a badly formatted incident_tracker.module. Each sniff is a test plus (sometimes) a fixer — that is the entire difference between phpcs and phpcbf. Predict the error count, which lines carry [x], and what survives the fixer.",
    code: `<?php
// A miniature phpcs. A "standard" is just a bag of sniffs: each one
// inspects a line, reports a violation, and SOMETIMES knows how to
// rewrite it. That rewrite half is what phpcbf runs.

$source = <<<'MODULE'
<?php

function incident_tracker_status_options() {
    $labels = array('open' => 'Open', 'closed' => 'Closed');
    $default = \\Drupal::config('incident_tracker.settings')->get('default');
    if ($default === null) {
        return $labels;
    } else {
        return array($default => $labels[$default]);
    }
}
MODULE;

$sniffs = [
    [
        'code' => 'Drupal.WhiteSpace.ScopeIndent',
        'type' => 'ERROR',
        'text' => fn(string $l, int $exp): string => sprintf(
            'Line indented incorrectly; expected %d spaces, found %d',
            $exp,
            strlen($l) - strlen(ltrim($l, ' '))
        ),
        'test' => fn(string $l, int $exp): bool => trim($l) !== ''
            && strlen($l) - strlen(ltrim($l, ' ')) !== $exp,
        'fix' => fn(string $l, int $exp): string => str_repeat(' ', $exp) . ltrim($l),
    ],
    [
        'code' => 'Generic.Arrays.DisallowLongArraySyntax',
        'type' => 'ERROR',
        'text' => fn(string $l, int $exp): string => 'Short array syntax must be used to define arrays',
        'test' => fn(string $l, int $exp): bool => str_contains($l, 'array('),
        'fix' => fn(string $l, int $exp): string => preg_replace('/array\\((.*)\\)/', '[$1]', $l),
    ],
    [
        'code' => 'Generic.PHP.UpperCaseConstant',
        'type' => 'ERROR',
        'text' => fn(string $l, int $exp): string => 'TRUE, FALSE and NULL must be uppercase; found "null"',
        'test' => fn(string $l, int $exp): bool => (bool) preg_match('/\\bnull\\b/', $l),
        'fix' => fn(string $l, int $exp): string => preg_replace('/\\bnull\\b/', 'NULL', $l),
    ],
    [
        'code' => 'Drupal.ControlStructures.ControlSignature',
        'type' => 'ERROR',
        'text' => fn(string $l, int $exp): string => 'Expected "else" on a line of its own after the closing brace',
        'test' => fn(string $l, int $exp): bool => str_contains($l, '} else {'),
        'fix' => fn(string $l, int $exp): string => preg_replace(
            '/^(\\s*)\\} else \\{/',
            '$1}' . "\\n" . '$1else {',
            $l
        ),
    ],
    [
        'code' => 'Drupal.Commenting.FunctionComment.Missing',
        'type' => 'ERROR',
        'text' => fn(string $l, int $exp): string => 'Missing function doc comment',
        'test' => fn(string $l, int $exp): bool => str_starts_with($l, 'function '),
        'fix' => NULL,
    ],
    // SIMPLIFIED ON PURPOSE. The real DrupalPractice sniff is scope-aware: it
    // returns early unless the \\Drupal:: call sits inside a class that could
    // inject the service instead (a class declared in *.services.yml, one
    // implementing ContainerInjectionInterface, or a ControllerBase/FormBase
    // style subclass). On the procedural .module function below, real phpcs
    // reports 0 warnings. We run it line-wise anyway so the report shows what
    // a non-fixable WARNING looks like beside the ERRORs -- and because the
    // \\Drupal:: call really is the architectural smell the sniff is about.
    [
        'code' => 'DrupalPractice.Objects.GlobalDrupal',
        'type' => 'WARNING',
        'text' => fn(string $l, int $exp): string => '\\Drupal calls should be avoided in classes, use dependency injection instead',
        'test' => fn(string $l, int $exp): bool => str_contains($l, '\\Drupal::'),
        'fix' => NULL,
    ],
];

// Walk the file tracking scope depth (that is all ScopeIndent really is).
// $apply = FALSE is phpcs; $apply = TRUE is phpcbf.
$walk = function (string $php, bool $apply) use ($sniffs): array {
    $found = [];
    $out = [];
    $depth = 0;
    foreach (explode("\\n", $php) as $i => $line) {
        $trimmed = trim($line);
        $closes_first = str_starts_with($trimmed, '}');
        if ($closes_first) {
            $depth = max(0, $depth - 1);
        }
        $expected = $depth * 2;
        foreach ($sniffs as $sniff) {
            if (($sniff['test'])($line, $expected)) {
                $found[] = [
                    'line' => $i + 1,
                    'type' => $sniff['type'],
                    'code' => $sniff['code'],
                    'text' => ($sniff['text'])($line, $expected),
                    'fixable' => $sniff['fix'] !== NULL,
                ];
                if ($apply && $sniff['fix'] !== NULL) {
                    $line = ($sniff['fix'])($line, $expected);
                }
            }
        }
        $out[] = $line;
        $net = substr_count($trimmed, '{') - substr_count($trimmed, '}');
        $depth = max(0, $depth + $net + ($closes_first ? 1 : 0));
    }
    return ['report' => $found, 'source' => implode("\\n", $out)];
};

$report = $walk($source, FALSE)['report'];
$errors = count(array_filter($report, fn(array $r): bool => $r['type'] === 'ERROR'));
$warnings = count($report) - $errors;
$fixable = count(array_filter($report, fn(array $r): bool => $r['fixable']));

echo "FILE: web/modules/custom/incident_tracker/incident_tracker.module\\n";
echo str_repeat('-', 68) . "\\n";
printf(
    "FOUND %d ERRORS AND %d WARNING%s AFFECTING %d LINES\\n",
    $errors,
    $warnings,
    $warnings === 1 ? '' : 'S',
    count(array_unique(array_column($report, 'line')))
);
echo str_repeat('-', 68) . "\\n";
foreach ($report as $r) {
    printf(" %2d | %-7s | [%s] %s\\n", $r['line'], $r['type'], $r['fixable'] ? 'x' : ' ', $r['text']);
}
echo str_repeat('-', 68) . "\\n";
printf("PHPCBF CAN FIX THE %d MARKED SNIFF VIOLATIONS AUTOMATICALLY\\n", $fixable);

// phpcbf loops until the file stops changing -- one fix can expose another.
$current = $source;
$passes = 0;
while ($passes < 50) {
    $step = $walk($current, TRUE);
    if ($step['source'] === $current) {
        break;
    }
    $current = $step['source'];
    $passes++;
}

printf("\\n-- phpcbf --standard=Drupal (%d pass) --\\n", $passes);
echo $current . "\\n";

echo "\\n-- phpcs re-run --\\n";
foreach ($walk($current, FALSE)['report'] as $r) {
    printf("line %d %s %s\\n", $r['line'], $r['type'], $r['code']);
}
echo 'Left over: documentation and architecture -- neither is auto-fixable.';`,
    output: `FILE: web/modules/custom/incident_tracker/incident_tracker.module
--------------------------------------------------------------------
FOUND 12 ERRORS AND 1 WARNING AFFECTING 8 LINES
--------------------------------------------------------------------
  3 | ERROR   | [ ] Missing function doc comment
  4 | ERROR   | [x] Line indented incorrectly; expected 2 spaces, found 4
  4 | ERROR   | [x] Short array syntax must be used to define arrays
  5 | ERROR   | [x] Line indented incorrectly; expected 2 spaces, found 4
  5 | WARNING | [ ] \\Drupal calls should be avoided in classes, use dependency injection instead
  6 | ERROR   | [x] Line indented incorrectly; expected 2 spaces, found 4
  6 | ERROR   | [x] TRUE, FALSE and NULL must be uppercase; found "null"
  7 | ERROR   | [x] Line indented incorrectly; expected 4 spaces, found 8
  8 | ERROR   | [x] Line indented incorrectly; expected 2 spaces, found 4
  8 | ERROR   | [x] Expected "else" on a line of its own after the closing brace
  9 | ERROR   | [x] Line indented incorrectly; expected 4 spaces, found 8
  9 | ERROR   | [x] Short array syntax must be used to define arrays
 10 | ERROR   | [x] Line indented incorrectly; expected 2 spaces, found 4
--------------------------------------------------------------------
PHPCBF CAN FIX THE 11 MARKED SNIFF VIOLATIONS AUTOMATICALLY

-- phpcbf --standard=Drupal (1 pass) --
<?php

function incident_tracker_status_options() {
  $labels = ['open' => 'Open', 'closed' => 'Closed'];
  $default = \\Drupal::config('incident_tracker.settings')->get('default');
  if ($default === NULL) {
    return $labels;
  }
  else {
    return [$default => $labels[$default]];
  }
}

-- phpcs re-run --
line 3 ERROR Drupal.Commenting.FunctionComment.Missing
line 5 WARNING DrupalPractice.Objects.GlobalDrupal
Left over: documentation and architecture -- neither is auto-fixable.`,
  },

  keyPoints: [
    "composer require --dev drupal/coder installs phpcs plus the Drupal and DrupalPractice standards; the dealerdirect/phpcodesniffer-composer-installer plugin must be allow-listed in composer.json or the standards never register (verify with vendor/bin/phpcs -i).",
    "Drupal = formatting/docs (2-space indent, braces on the same line, else on its own line, uppercase TRUE/FALSE/NULL, [] arrays, docblocks everywhere, no closing ?>); DrupalPractice = API misuse warnings such as \\Drupal:: inside an injectable class or t() in an exception message.",
    "phpcbf auto-fixes the mechanical sniffs and loops until the file stops changing; it can never write your missing docblocks or refactor a static \\Drupal:: call into dependency injection. Commit a phpcs.xml.dist listing the standards AND the extensions, or phpcs skips .module, .install, .theme and .yml files entirely.",
    "PHPStan needs mglaman/phpstan-drupal (bootstrapping, \\Drupal::service() and getStorage() return types) plus phpstan/phpstan-deprecation-rules, with parameters.drupal.drupal_root pointing at the web root; custom code should target level 5-6 and climb.",
    "For legacy code run phpstan analyse --generate-baseline, commit phpstan-baseline.neon and include it — old errors freeze, new code is held to the level, and the baseline shrinks as you touch files.",
    "D10 to D11 readiness = deprecation rules for your own calls + the upgrade_status module (drush upgrade_status:analyze incident_tracker) for info.yml and environment checks; palantirnet/drupal-rector rewrites many deprecations automatically.",
  ],

  interview: [
    {
      q: "How do you enforce the Drupal coding standard on a custom module, and what can the auto-fixer not do for you?",
      a: "Add `drupal/coder` as a dev dependency — it brings `squizlabs/php_codesniffer` and registers two standards, `Drupal` and `DrupalPractice`, via the phpcodesniffer-composer-installer plugin (which must be allow-listed in `composer.json`, a very common setup gotcha). Then run `vendor/bin/phpcs --standard=Drupal,DrupalPractice web/modules/custom/incident_tracker`, with a committed `phpcs.xml.dist` so CI and everyone's IDE use the same config and the same `--extensions` list — otherwise `.module` and `.install` files are silently skipped. `phpcbf` fixes the mechanical violations: indentation, `array()` to `[]`, lowercase `true`/`null`, `else` placement, trailing whitespace. What it cannot do is write the missing docblocks, fix a comment that does not end in a full stop with a meaningful sentence, or act on DrupalPractice warnings like \"\\Drupal calls should be avoided in classes, use dependency injection instead\" — those are design decisions, which is exactly why they are worth reviewing by hand.",
    },
    {
      q: "What does phpstan-drupal add over plain PHPStan, and how would you introduce it to a legacy module with hundreds of errors?",
      a: "Plain PHPStan cannot even autoload Drupal's procedural files, so `incident_tracker.module` and every hook in it are invisible. `mglaman/phpstan-drupal` bootstraps Drupal, teaches PHPStan the container (`\\Drupal::service('x')` return types) and — the big one — entity storage generics: `$this->entityTypeManager->getStorage('node')` is a `NodeStorage`, so `->load()` returns a `Node` and field access can actually be checked. Paired with `phpstan/phpstan-deprecation-rules` it also flags every call into an `@deprecated` core API, which is how you find your D11 blockers. For a legacy module I would not fix everything first: run `phpstan analyse --generate-baseline`, commit `phpstan-baseline.neon`, and include it from `phpstan.neon`. Existing errors are frozen, new code is held to the configured level, and you shrink the baseline opportunistically as you touch files.",
    },
    {
      q: "A client asks whether their Drupal 10 site's custom modules are ready for Drupal 11. What is your process?",
      a: "Two passes, static and Drupal-aware. First, static: run PHPStan with `phpstan-drupal` plus the deprecation rules over `modules/custom` — every call to something like `watchdog_exception()` (deprecated in 10.1, removed in 11.0) shows up with the removal version and the replacement in the message. Second, install the `upgrade_status` contrib module and run `drush upgrade_status:analyze incident_tracker` or read **Reports > Upgrade status**; it wraps the same analysis but additionally checks things a linter never sees — `core_version_requirement` in each `.info.yml`, use of core modules removed in 11, deprecated Twig filters, and the PHP/database version requirements of the environment. `palantirnet/drupal-rector` then rewrites a large share of the mechanical deprecations. The unfixable remainder is where you budget real time: removed APIs with no drop-in replacement, and contrib modules with no D11 release.",
    },
    {
      q: "Coming from Symfony, what will actually trip you up in the Drupal standard?",
      a: "Mostly muscle memory rather than concepts. The two-space indent is the one that hurts for a week — set your editor per-project, do not fight it. Braces go on the *same* line as class and method declarations, the opposite of PSR-12, and `else` must sit on its own line after the closing brace rather than `} else {`. `TRUE`, `FALSE` and `NULL` are uppercase. Documentation is mandatory, not optional: every class, method and hook needs a docblock with `@param` lines whose description sits on the following line, and even inline comments must end with a full stop. `declare(strict_types=1)` is permitted and core is adding it to new 11.x files, but it is not required by the standard. Practically, the fix is to run `phpcbf` before every commit and let the tool carry the style rules so code review can be about behaviour.",
    },
  ],

  quiz: [
    {
      question:
        "You run phpcbf --standard=Drupal over incident_tracker and phpcs still reports errors. Which of these is phpcbf unable to fix?",
      options: [
        "Line indented incorrectly; expected 2 spaces, found 4",
        "Short array syntax must be used to define arrays",
        "Missing function doc comment",
        "TRUE, FALSE and NULL must be uppercase",
      ],
      answerIndex: 2,
      explain:
        "A sniff can only auto-fix when it also ships a fixer, and a fixer can only rewrite tokens it can derive mechanically. Indentation, array() to [], and constant casing are all deterministic rewrites. A doc comment requires knowing what the function does and what its parameters mean — no tool can invent that, so phpcs reports it without the [x] fixable marker. The same is true of most DrupalPractice warnings, which describe design problems rather than formatting.",
    },
    {
      question:
        "Which phpcs standard flags 'Drupal calls should be avoided in classes, use dependency injection instead'?",
      options: [
        "Drupal — it is part of the core formatting standard",
        "DrupalPractice — the ruleset for API misuse and best practice",
        "PSR12 — it forbids static calls",
        "PHPStan, not phpcs at all",
      ],
      answerIndex: 1,
      explain:
        "Coder ships two rulesets. 'Drupal' covers formatting and documentation — whitespace, braces, docblocks, array syntax — and is essentially non-negotiable for contributed code. 'DrupalPractice' is the opinionated layer about API usage: static \\Drupal:: calls in a class that could inject the service, t() inside exception messages, unused variables, config schema disabled in tests. They are usually run together (--standard=Drupal,DrupalPractice), but DrupalPractice findings are mostly warnings you triage rather than errors you must clear.",
    },
    {
      question:
        "In phpstan.neon, what does including vendor/mglaman/phpstan-drupal/extension.neon actually buy you?",
      options: [
        "It raises the analysis level to 9 automatically",
        "It reformats code to the Drupal standard, replacing phpcbf",
        "It bootstraps Drupal so .module files autoload, and adds container and entity-storage return types (getStorage('node') is a NodeStorage)",
        "It installs the upgrade_status module for you",
      ],
      answerIndex: 2,
      explain:
        "The extension makes PHPStan Drupal-aware: it bootstraps enough of Drupal to autoload procedural .module/.install files and hook implementations, and it registers dynamic return-type extensions so \\Drupal::service() ids and $entityTypeManager->getStorage('node') resolve to real classes instead of mixed. That is what turns level 5+ analysis from a wall of noise into useful findings. Levels are still set by you via parameters.level, formatting is still phpcs/phpcbf's job, and upgrade_status is a separate contrib module.",
    },
    {
      question:
        "You inherit a custom module that produces 600 PHPStan errors at level 6. What is the pragmatic first move?",
      options: [
        "Drop to level 0 permanently so the build is green",
        "Run phpstan analyse --generate-baseline, commit phpstan-baseline.neon, include it, and hold new code to level 6",
        "Add the module to excludePaths so it is never analysed",
        "Fix all 600 errors before merging anything else",
      ],
      answerIndex: 1,
      explain:
        "The baseline exists exactly for this. --generate-baseline writes phpstan-baseline.neon containing the current errors (message pattern, count, path); including it from phpstan.neon freezes them so the tool exits 0 today while any NEW violation at level 6 fails the build. That gives you a ratchet: the baseline only shrinks as you touch files. Dropping the level or excluding the path throws away the checking you just paid for, and a 600-error big-bang cleanup blocks feature work and produces an unreviewable diff.",
    },
  ],
};

export default lesson;
