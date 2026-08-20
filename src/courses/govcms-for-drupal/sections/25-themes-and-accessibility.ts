import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "themes-and-accessibility",
  title: "Accessibility Is an Obligation: Theming Inside It",
  part: "Building on GovCMS & Interview Prep",
  estMinutes: 13,
  summary:
    "Accessibility on an Australian Government site is a contract term rather than a pre-launch task, and on GovCMS the theme is the only code layer you have left to satisfy it in.",
  concept: `## Accessibility is a clause, not a checklist

You have shipped Drupal sites where accessibility was a sprint near the end. On a GovCMS engagement it is written into the paperwork before you open an editor, and the paperwork does not agree with itself on the version number — so quote the source, not a number.

- govcms.gov.au/accessibility: *"Our website meets the Australian Government's web accessibility requirements. These include the World Wide Web Consortium's Web Content Accessibility Guidelines version 2.0 (WCAG 2.0) ... at level AA."*
- govcms.gov.au/why-govcms: *"The GovCMS platform is set up to meet Web Content Accessibility Guidelines (WCAG) 2.1 out-of-the-box. Individual agencies need to ensure their website continue to meet accessibility standards."*
- The published draft Statement of Requirement for the GovCMS Drupal Services Panel refresh (2021), clause 14: *"The Contractor must ensure that all Deliverables ... including all Drupal modules and Drupal themes developed or enhanced by the Contractor, meet Web Content Accessibility Guidelines 2.1 AA Compliance (WCAG 2.1 AA)"*.

The constant across all three is **Level AA**. The second quote is the one to internalise: the platform's claim covers the platform. Your theme and your content are yours, and the panel wording makes the theme an explicitly named deliverable.

### The theme is the only surface left

On SaaS the entire build payload is three lines of \`.docker/Dockerfile.saas\`:

\`\`\`docker
COPY themes/ /app/web/themes/custom
COPY config /app/config
COPY favicon.ico /app/web
\`\`\`

Repo-root \`themes/\` lands at \`web/themes/custom\`. \`modules/custom\` never enters the image. The wiki FAQ is blunt about it — *"only \`/themes\` and \`/config\` are used in your Lagoon build"* — and equally blunt that an admin theme is fine, because *"an admin theme is just a theme so it's allowed."*

Theme PHP is real PHP: \`hook_form_alter()\`, \`hook_preprocess_HOOK()\`, and namespaced classes under \`themes/mytheme/src\` that Drupal autoloads. What you cannot do is \`mytheme.services.yml\`, new services, routes, or overriding another module's service. So every remediation you would normally reach for a module to do, you now do in a preprocess hook or in exported configuration.

### What the platform actually checks in your theme

Shipshape reads the theme tree four ways, and none of them is an accessibility check:

| check | severity |
|---|---|
| \`[FILE] Yaml lint theme files\` (and the no-web-prefix twin) | \`high\` |
| \`[FILE] Detect module files in theme folder\` | none declared |
| \`[FILE] Banned PHP function list\` (\`phpstan.neon\`) | none declared |
| \`[FILE] Banned PHP methods and classes\` (\`phpstan-extra.neon\`) | \`low\` |

Shipshape runs every check and exits 2 only when a breach sits at or above \`--fail-severity\` (default \`high\`), so a banned \`dd()\` in your \`.theme\` fails the report, not the deploy — the standalone \`govcms-validate-php-functions\` script is the one that exits non-zero. The module detector's whole assertion is that no \`*.info.yml\` under the theme directory declares \`type: module\`. \`phpstan-extra.neon\` also forbids \`GuzzleHttp\\Client\` and every \`Drupal::service()\` call except \`page_cache_kill_switch\`.

GovCMS ships no accessibility gate. The scaffold's Behat tags are \`@skipped\`, \`@javascript\`, \`@smoke\`, \`@api\` and the \`@p0\`/\`@p1\` profile filters — there is no \`@a11y\`, no axe, no pa11y. If conformance is going to be continuous and testable, you bring the runner.

### Continuous, not pre-launch

Contrast is arithmetic over sRGB relative luminance — you can compute it in a build step instead of arguing about it in a design review. Alt text, heading order, link purpose, form labels and table headers are all decidable from the markup your Twig emits. Put those in CI and conformance stops being an event.`,
  comparisons: [
    {
      label: "Where the theme lives and what ships",
      intro:
        "Standing up a custom theme plus an admin theme. On your own site the theme is just another directory in a repo you deploy whole; on GovCMS SaaS the repository is filtered down to three COPY lines.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal: the theme is one more Composer-managed thing in the tree.
composer require drupal/gin
drush theme:enable gin -y
drush config:set system.theme admin gin -y

# Your theme sits next to your modules; both are yours.
mkdir -p web/themes/custom/agency web/modules/custom/agency_a11y
drush theme:enable agency -y
drush config:set system.theme default agency -y
drush cache:rebuild

# Deploy ships the whole working tree. Nothing filters it.
rsync -a --delete ./ deploy@web01:/var/www/app/`,
      ts: `# GovCMS SaaS: repo-root themes/ IS the code extension point.
# .docker/Dockerfile.saas is the entire filter, and it is a locked file:
#
#   FROM govcms/govcms:\${GOVCMS_IMAGE_VERSION}
#   ENV WEBROOT=web
#   COPY themes/ /app/web/themes/custom
#   COPY config /app/config
#   COPY favicon.ico /app/web

mkdir -p themes/agency
ahoy up

# drush never runs on the host - ahoy drush is
# "docker compose exec -T cli drush".
ahoy drush theme:enable agency -y
ahoy drush config:set system.theme default agency -y
ahoy drush config:set system.theme admin claro -y

# The deploy artefact is the exported config, not the drush command.
ahoy drush cex -y
git add themes/agency config/default
git commit -m "feat(theme): agency front-end and Claro admin"
git push origin develop`,
      note: "web/modules/custom exists locally and never enters the SaaS image. An admin theme is allowed because it is a theme; a module dressed as one is caught by '[FILE] Detect module files in theme folder'.",
    },
    {
      label: "Putting behaviour behind the markup",
      intro:
        "Same job: normalise heading levels in a node template and attach a skip-link library. On a site you control that logic belongs in a service; in a GovCMS theme there is no service container entry point.",
      php: `<?php

// web/modules/custom/agency_a11y/agency_a11y.module
// The class is registered in agency_a11y.services.yml and injected here.

use Drupal\\agency_a11y\\HeadingOutline;

/**
 * Implements hook_preprocess_HOOK() for node.
 */
function agency_a11y_preprocess_node(array &$variables): void {
  /** @var \\Drupal\\agency_a11y\\HeadingOutline $outline */
  $outline = \\Drupal::service('agency_a11y.outline');
  $variables['sections'] = $outline->demote($variables['content']['#sections'] ?? [], 2);
  $variables['#attached']['library'][] = 'agency_a11y/skip_link';
}

/**
 * Implements hook_page_attachments_alter().
 */
function agency_a11y_page_attachments_alter(array &$attachments): void {
  $attachments['#attached']['html_head'][] = [
    ['#tag' => 'meta', '#attributes' => ['name' => 'viewport',
      '#value' => 'width=device-width, initial-scale=1']],
    'viewport',
  ];
}`,
      ts: `<?php

// themes/agency/agency.theme  ->  /app/web/themes/custom/agency/agency.theme
// Hooks and preprocess are allowed. themes/agency/src is PSR-4 autoloaded
// under Drupal\\agency, so the class still exists - just not as a service.

use Drupal\\agency\\HeadingOutline;

/**
 * Implements hook_preprocess_HOOK() for node.
 */
function agency_preprocess_node(array &$variables): void {
  // No agency.services.yml: Drupal does not discover services declared by a
  // theme, and phpstan-extra.neon disallows Drupal::service() across the
  // theme tree with one exception, page_cache_kill_switch.
  $outline = new HeadingOutline();
  $variables['sections'] = $outline->demote($variables['content']['#sections'] ?? [], 2);
  $variables['#attached']['library'][] = 'agency/skip_link';
}

/**
 * Implements hook_theme_suggestions_HOOK_alter() for input.
 *
 * Gives every input type its own template so labels and describedby
 * wiring can be fixed once, in Twig, instead of per form.
 */
function agency_theme_suggestions_input_alter(array &$suggestions, array $variables): void {
  $suggestions[] = 'input__' . $variables['element']['#type'];
}`,
      note: "The wiki FAQ draws the line exactly here: hooks and autoloaded src classes yes; mytheme.services.yml, routes and service overrides no. Reach for a preprocess hook or a template, not a container.",
    },
    {
      label: "The accessibility gate in CI",
      intro:
        "You want a merge to fail when a page regresses below Level AA. On a site you own you write that job. On GovCMS you still have to write it, because nothing the platform runs over your theme looks at accessibility at all.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .gitlab-ci.yml on a site you control - you own the gate.
a11y:
  stage: test
  needs: [build]
  script:
    - npm ci
    - npx pa11y-ci --standard WCAG2AA --sitemap http://web/sitemap.xml
    - npx axe http://web/ http://web/news http://web/contact --exit
  artifacts:
    when: always
    reports:
      junit: reports/a11y.xml
  allow_failure: false`,
      ts: `# vendor/govcms/scaffold-tooling/shipshape.yml - every check that reads
# your theme directory. Not one of them is an accessibility check.
checks:
  yaml:
    - name: '[FILE] Detect module files in theme folder'
      pattern: '.*.info.yml'
      ignore-missing: true
      path: 'themes'
      values:
        - key: type
          value: theme
  yamllint:
    - name: '[FILE] Yaml lint theme files'
      severity: high
      path: web/themes
      pattern: ".*.yml"
      exclude-pattern: node_modules
      ignore-missing: true
  phpstan:
    - name: '[FILE] Banned PHP function list'
      configuration: vendor/govcms/scaffold-tooling/phpstan.neon
      paths:
        - web/themes/custom
        - themes
    - name: '[FILE] Banned PHP methods and classes'
      severity: low
      configuration: vendor/govcms/scaffold-tooling/phpstan-extra.neon
      paths:
        - web/themes/custom
        - themes`,
      note: "Shipshape runs every check then exits 2 only for a breach at or above --fail-severity (default high). Only the YAML lint qualifies, so a banned dd() in your .theme fails the report, not the deploy.",
    },
    {
      label: "Making alt text non-optional",
      intro:
        "SC 1.1.1 fails one editor at a time. Standard Drupal answer: a validation constraint in a module. GovCMS answer: exported field configuration plus a theme form_alter, because there is no module to put it in.",
      php: `<?php

// web/modules/custom/agency_a11y/agency_a11y.module
// A module can reach every image field on the site at definition time.

use Drupal\\Core\\Entity\\EntityTypeInterface;
use Drupal\\Core\\Field\\FieldDefinitionInterface;

/**
 * Implements hook_entity_bundle_field_info_alter().
 */
function agency_a11y_entity_bundle_field_info_alter(
  array &$fields,
  EntityTypeInterface $entity_type,
  string $bundle,
): void {
  foreach ($fields as $field) {
    if (!$field instanceof FieldDefinitionInterface) {
      continue;
    }
    if ($field->getType() !== 'image') {
      continue;
    }
    $field->setSetting('alt_field', TRUE);
    $field->setSetting('alt_field_required', TRUE);
    // Plugin at src/Plugin/Validation/Constraint/AltTextConstraint.php.
    $field->addConstraint('AgencyAltText', []);
  }
}`,
      ts: `<?php

// themes/agency/agency.theme
// No module, so the rule lives in the two places SaaS does give you:
// exported configuration, and a theme hook.
//
//   config/default/field.field.media.image.field_media_image.yml
//     settings:
//       alt_field: true
//       alt_field_required: true
//
// config_ignore's defaults cover webform.*, seckit, password_policy and
// friends - field config is not ignored, so this deploys normally.

use Drupal\\Core\\Form\\FormStateInterface;

/**
 * Implements hook_form_alter().
 */
function agency_form_alter(array &$form, FormStateInterface $form_state, string $form_id): void {
  if (!str_starts_with($form_id, 'media_image_')) {
    return;
  }
  $form['field_media_image']['widget'][0]['alt']['#required'] = TRUE;
  $form['field_media_image']['widget'][0]['alt']['#description'] =
    t('Describe the image for someone who cannot see it. Do not begin with "image of".');
  $form['#validate'][] = 'agency_validate_alt_text';
}

/**
 * Rejects alt text that only repeats the filename.
 */
function agency_validate_alt_text(array &$form, FormStateInterface $form_state): void {
  $alt = trim((string) $form_state->getValue(['field_media_image', 0, 'alt']));
  if (preg_match('/\\\\.(png|jpe?g|svg|webp)$/i', $alt)) {
    $form_state->setErrorByName(
      'field_media_image][0][alt',
      t('Alt text must describe the image (WCAG 1.1.1), not repeat the filename.'),
    );
  }
}`,
      note: "hook_form_alter() from a theme is explicitly sanctioned by the wiki FAQ. The half of the rule that survives a cache rebuild is the exported field config; the form_alter is the editor-facing half.",
    },
  ],
  playground: {
    intro:
      "Two decidable rules, run as code. First SC 1.4.3 contrast over literal sRGB triples, then a markup scan over Twig fragments where every finding cites its success criterion. Nothing here needs a browser or a human.",
    lang: "php",
    code: `<?php

// SC 1.4.3 Contrast (Minimum), Level AA: 4.5:1 normal text,
// 3:1 large text (>=18pt, or >=14pt bold). Pure arithmetic.

function srgb(int $v): float {
  $c = $v / 255.0;
  return $c <= 0.03928 ? $c / 12.92 : pow(($c + 0.055) / 1.055, 2.4);
}

function lum(array $c): float {
  return 0.2126 * srgb($c[0]) + 0.7152 * srgb($c[1]) + 0.0722 * srgb($c[2]);
}

function ratio(array $fg, array $bg): float {
  $a = lum($fg);
  $b = lum($bg);
  return (max($a, $b) + 0.05) / (min($a, $b) + 0.05);
}

function hex(array $c): string {
  return sprintf('#%02X%02X%02X', $c[0], $c[1], $c[2]);
}

$tokens = [
  ['body copy',      [0, 85, 139],    [255, 255, 255], 'normal'],
  ['metadata line',  [117, 117, 117], [255, 255, 255], 'normal'],
  ['hero headline',  [148, 148, 148], [255, 255, 255], 'large'],
  ['primary button', [255, 255, 255], [0, 113, 188],   'normal'],
  ['disabled link',  [170, 170, 170], [255, 255, 255], 'normal'],
];

printf("SC 1.4.3 CONTRAST (MINIMUM) -- LEVEL AA\\n");
printf("%-15s %-8s %-8s %-7s %6s %6s  %s\\n", 'TOKEN', 'FG', 'BG', 'SIZE', 'RATIO', 'NEEDS', 'VERDICT');
printf("%s\\n", str_repeat('-', 68));
foreach ($tokens as $t) {
  $r = round(ratio($t[1], $t[2]), 2);
  $need = $t[3] === 'large' ? 3.0 : 4.5;
  printf("%-15s %-8s %-8s %-7s %6s %6s  %s\\n", $t[0], hex($t[1]), hex($t[2]), $t[3],
    number_format($r, 2), number_format($need, 2), $r >= $need ? 'PASS' : 'FAIL');
}

// Rules a theme can break on its own, all Level A.
$rules = [
  ['1.1.1', 'Non-text Content', 'alt', 'img element carries no alt attribute'],
  ['1.3.1', 'Info and Relationships', 'skip', 'heading level jumps by more than one'],
  ['2.4.4', 'Link Purpose (In Context)', 'link', 'link text is meaningless out of context'],
  ['3.3.2', 'Labels or Instructions', 'label', 'input has no programmatic label'],
  ['1.3.1', 'Info and Relationships', 'th', 'data table declares no header cells'],
];

function detect(string $rule, string $h): bool {
  if ($rule === 'alt') {
    return (bool) preg_match('/<img\\\\b(?![^>]*\\\\balt=)[^>]*>/i', $h);
  }
  if ($rule === 'skip') {
    preg_match_all('/<h([1-6])\\\\b/i', $h, $m);
    for ($i = 1; $i < count($m[1]); $i++) {
      if ((int) $m[1][$i] - (int) $m[1][$i - 1] > 1) {
        return TRUE;
      }
    }
    return FALSE;
  }
  if ($rule === 'link') {
    return (bool) preg_match('/<a\\\\b[^>]*>\\\\s*(click here|read more|more|here)\\\\s*<\\\\/a>/i', $h);
  }
  if ($rule === 'label') {
    return (bool) preg_match('/<input\\\\b(?![^>]*aria-label)[^>]*>/i', $h);
  }
  return (bool) preg_match('/<table\\\\b/i', $h) && !preg_match('/<th\\\\b/i', $h);
}

$fragments = [
  ['page--front.twig:12', '<img src="/files/crest.png" width="120">'],
  ['node--page.twig:31', '<h2>Eligibility</h2><h4>Who can apply</h4>'],
  ['block--footer.twig:8', '<a href="/annual-report.pdf">Click here</a>'],
  ['form--search.twig:4', '<input type="search" name="keys" placeholder="Search">'],
  ['field--table.twig:6', '<table><tr><td>2024-25</td><td>1204</td></tr></table>'],
  ['node--page.twig:44', '<img src="/chart.png" alt="Grants awarded, by state">'],
];

printf("\\nTHEME MARKUP SCAN -- every finding cites its criterion\\n");
printf("%-21s %-8s %-26s %s\\n", 'FRAGMENT', 'SC', 'CRITERION', 'FINDING');
printf("%s\\n", str_repeat('=', 92));
$total = 0;
foreach ($fragments as $f) {
  $hits = 0;
  foreach ($rules as $r) {
    if (detect($r[2], $f[1])) {
      printf("%-21s %-8s %-26s %s\\n", $f[0], $r[0] . ' A', $r[1], $r[3]);
      $hits++;
      $total++;
    }
  }
  if ($hits === 0) {
    printf("%-21s %-8s %-26s %s\\n", $f[0], '-', '-', 'no automatable finding');
  }
}
printf("%s\\n", str_repeat('=', 92));
printf("%d findings, all Level A. Level AA conformance requires every A and AA\\n", $total);
printf("criterion, so a Level A failure is an AA failure. None of this is checked\\n");
printf("by GovCMS: bring your own runner, in CI, on every merge.\\n");`,
    output: `SC 1.4.3 CONTRAST (MINIMUM) -- LEVEL AA
TOKEN           FG       BG       SIZE     RATIO  NEEDS  VERDICT
--------------------------------------------------------------------
body copy       #00558B  #FFFFFF  normal    7.86   4.50  PASS
metadata line   #757575  #FFFFFF  normal    4.61   4.50  PASS
hero headline   #949494  #FFFFFF  large     3.03   3.00  PASS
primary button  #FFFFFF  #0071BC  normal    5.14   4.50  PASS
disabled link   #AAAAAA  #FFFFFF  normal    2.32   4.50  FAIL

THEME MARKUP SCAN -- every finding cites its criterion
FRAGMENT              SC       CRITERION                  FINDING
============================================================================================
page--front.twig:12   1.1.1 A  Non-text Content           img element carries no alt attribute
node--page.twig:31    1.3.1 A  Info and Relationships     heading level jumps by more than one
block--footer.twig:8  2.4.4 A  Link Purpose (In Context)  link text is meaningless out of context
form--search.twig:4   3.3.2 A  Labels or Instructions     input has no programmatic label
field--table.twig:6   1.3.1 A  Info and Relationships     data table declares no header cells
node--page.twig:44    -        -                          no automatable finding
============================================================================================
5 findings, all Level A. Level AA conformance requires every A and AA
criterion, so a Level A failure is an AA failure. None of this is checked
by GovCMS: bring your own runner, in CI, on every merge.
`,
  },
  keyPoints: [
    "govcms.gov.au states WCAG 2.0 Level AA on /accessibility and WCAG 2.1 on /why-govcms, and the published draft Statement of Requirement for the Drupal Services Panel refresh (2021) puts WCAG 2.1 AA on every deliverable, naming Drupal modules and Drupal themes the contractor develops — quote the source and treat **Level AA** as the only safe constant.",
    "The platform's own claim is scoped to the platform: */why-govcms* adds \"Individual agencies need to ensure their website continue to meet accessibility standards.\" Theme and content conformance is the agency's, and by extension yours.",
    "On SaaS the theme is the code extension point: `.docker/Dockerfile.saas` copies only `themes/` to `/app/web/themes/custom`, `config` to `/app/config`, and `favicon.ico`. `modules/custom` never enters the image.",
    "Theme PHP is real — `hook_form_alter()`, `hook_preprocess_HOOK()`, autoloaded classes in `themes/mytheme/src` — but `mytheme.services.yml`, new services, routes and service overrides are not discovered, so remediation moves into preprocess hooks and exported configuration.",
    "Shipshape reads the theme four ways: YAML lint (`high`), `[FILE] Detect module files in theme folder` (asserts no `*.info.yml` declares `type: module`), the banned-function phpstan run (no severity), and banned methods/classes (`low`) — only the YAML lint can reach the default `high` fail threshold.",
    "GovCMS ships no accessibility gate: the scaffold's Behat tags are `@skipped`, `@javascript`, `@smoke`, `@api` and the `@p0`/`@p1` filters, with no axe or pa11y integration — a continuous conformance story is something you add to CI yourself.",
  ],
  interview: [
    {
      q: "What accessibility standard applies to a GovCMS site, and who is responsible for meeting it?",
      a: "Level AA — and I would be careful about the version, because GovCMS's own site is not consistent. The `/accessibility` page says the site meets WCAG version 2.0 at level AA; `/why-govcms` says the platform is set up to meet WCAG 2.1 out of the box. The published draft Statement of Requirement for the Drupal Services Panel refresh (2021) is the one that speaks to the vendor directly: clause 14 requires that all deliverables, *including all Drupal modules and Drupal themes developed or enhanced by the Contractor*, meet WCAG 2.1 AA. On responsibility, `/why-govcms` is explicit that individual agencies must ensure their website continues to meet accessibility standards — so the distribution's admin experience is GovCMS's problem and my theme, my Twig and the client's content are mine. In practice I confirm the target level in the contract at kickoff rather than assuming, because the number moves and the level does not.",
    },
    {
      q: "You need to make alt text mandatory across the site. How do you do it on SaaS?",
      a: "Not with a module — `modules/custom` is not in the SaaS build payload, so it will never exist in the image. The durable half is exported configuration: set `alt_field: true` and `alt_field_required: true` in the image field's `field.field.*.yml` under `config/default`, which imports on rollout like any other config and is not touched by the platform's `config_ignore` defaults. The editor-facing half goes in the theme, because `hook_form_alter()` in a `.theme` file is explicitly allowed — I use it to set `#required`, write a description that actually tells the editor what good alt text looks like, and add a validate callback that rejects alt text that just repeats the filename. What I would not do is write `mytheme.services.yml` and inject a validator service, because Drupal does not discover services from themes and `phpstan-extra.neon` disallows `Drupal::service()` across the theme tree anyway.",
    },
    {
      q: "How would you stop accessibility regressions between releases on a GovCMS project?",
      a: "By accepting that the platform gives me nothing here and building the gate myself. Shipshape reads my theme four ways — YAML lint at `high`, the module-in-theme detector, and two phpstan runs — and none of them is an accessibility check; the scaffold's Behat suite only carries `@skipped`, `@javascript`, `@smoke`, `@api` and the `@p0`/`@p1` profile filters, so there is no `@a11y` tag or axe integration to switch on. So I add an axe or pa11y job to the project's own pipeline against the local `ahoy up` stack, fail the merge request on new violations rather than on the total, and pin design tokens by computing contrast ratios in a unit test so a palette change cannot silently drop below 4.5:1. The parts that are decidable — contrast, alt attributes, heading order, form labels, table headers — belong in CI. The parts that are not, like whether alt text is actually meaningful, get a manual review budget per release.",
    },
    {
      q: "A developer wants to put a small module inside the theme folder so it gets deployed on SaaS. What happens?",
      a: "The deploy notices. `govcms-validate-theme-modules` walks every `*.info.yml` under `web/themes` — falling back to `themes/` when there is no web root — and fails any file where `yq '.type'` returns `module`; Shipshape carries the same assertion as `[FILE] Detect module files in theme folder`. That is genuinely the whole check, so it forbids modules smuggled into the theme directory rather than constraining what a theme may contain. I would also point out that even if the file slipped through, Drupal would not discover a module from `web/themes/custom`, and the site's module allowlist is `module_permissions.settings.managed_modules` in the platform's `security.settings.php`, not the filesystem. The honest answer to the developer is that the need for a module is a scope conversation with GovCMS, not something to route around in the theme layer.",
    },
  ],
  quiz: [
    {
      question:
        "Which statement about WCAG and GovCMS is safe to make in an interview?",
      options: [
        "The DTA mandates WCAG 2.1 Level AA for all Australian Government websites.",
        "GovCMS guarantees WCAG conformance for the whole site, including the agency's theme and content.",
        "govcms.gov.au cites WCAG 2.0 Level AA on /accessibility and WCAG 2.1 on /why-govcms; Level AA is the constant, and agencies remain responsible for their own site.",
        "GovCMS 4.x raised the platform baseline from WCAG 2.0 to WCAG 2.2 Level AAA.",
      ],
      answerIndex: 2,
      explain:
        "The two govcms.gov.au pages genuinely disagree on the version, so quote both and hold Level AA constant. /why-govcms adds that individual agencies must ensure their website continues to meet accessibility standards. The whole-of-government instruments say 'latest version of WCAG' with no number, so do not attribute a version to the DTA.",
    },
    {
      question:
        "Which of these can a GovCMS SaaS theme legitimately contain and have Drupal use?",
      options: [
        "`hook_form_alter()` in `agency.theme` plus a PSR-4 class under `themes/agency/src`.",
        "`agency.services.yml` declaring a validator service injected into a preprocess hook.",
        "`agency.routing.yml` adding an accessibility-statement route.",
        "A service override that decorates `renderer` to post-process markup.",
      ],
      answerIndex: 0,
      explain:
        "The wiki FAQ draws exactly this line: hooks such as hook_form_alter() and hook_preprocess_node(), plus namespaced classes in themes/mytheme/src that Drupal autoloads, all work. Services declared by a theme are not discovered, and routes and service overrides are module-only.",
    },
    {
      question:
        "You commit a `dd()` call in `agency.theme` and push to a SaaS environment. What happens to the deploy?",
      options: [
        "Shipshape stops at the first failed check and the rollout aborts before any task runs.",
        "Nothing detects it; the banned-function list only covers `web/modules/custom`.",
        "The theme YAML lint fails at severity `high`, which fails the deploy.",
        "It is reported by `[FILE] Banned PHP function list`, which declares no severity, so the report fails but the deploy does not.",
      ],
      answerIndex: 3,
      explain:
        "`dd()` is on the disallowedFunctionCalls list in phpstan.neon, which Shipshape runs over `web/themes/custom` and `themes`. That check declares no severity, so it defaults below the `high` fail threshold. Shipshape never short-circuits — it runs every check, then exits 2 only for a breach at or above --fail-severity. Only the standalone `govcms-validate-php-functions` script exits non-zero on it.",
    },
    {
      question:
        "A colour token measures 3.4:1 against its background and is used for 14px body copy. Under SC 1.4.3 Level AA, what is the verdict?",
      options: [
        "Pass — 3:1 is the Level AA minimum for all text.",
        "Fail — normal text needs 4.5:1; only large text (at least 18pt, or 14pt bold) may use the 3:1 threshold.",
        "Pass — 3.4:1 rounds up to the 4.5:1 requirement for text under 16px.",
        "Fail — Level AA requires 7:1 for all body copy.",
      ],
      answerIndex: 1,
      explain:
        "SC 1.4.3 Contrast (Minimum) sets 4.5:1 for normal text and relaxes it to 3:1 only for large-scale text. 7:1 is SC 1.4.6 Contrast (Enhanced) at Level AAA, which is not the Australian Government baseline. 14px regular body copy is normal text, so 3.4:1 fails.",
    },
  ],
};

export default lesson;
