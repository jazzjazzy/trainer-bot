import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "the-custom-code-boundary",
  title: "No Custom Code: What SaaS Actually Forbids",
  part: "The Distribution & Your Codebase",
  estMinutes: 13,
  summary:
    "On GovCMS SaaS the code boundary is enforced by three COPY lines in a locked Dockerfile, so learn exactly which repo paths are still yours, what a theme may legally contain, and what the escape routes cost.",
  concept: `## The boundary is a Dockerfile, not a policy document

On SaaS the limit on your code is not enforced by review, and it is not a contract clause you can argue about. It is three lines. After \`FROM govcms/govcms:...\` and \`ENV WEBROOT=web\`, the entire body of \`.docker/Dockerfile.saas\` — the file \`scaffold-init.sh\` renames to \`.docker/Dockerfile.cli\`, which is what a provisioned repo actually contains — is:

\`\`\`dockerfile
COPY themes/ /app/web/themes/custom
COPY config /app/config
COPY favicon.ico /app/web
\`\`\`

Nothing else in your repository enters the image. That is why the surprise lands on day one rather than at review time: a \`web/modules/custom\` directory does not error, it is simply never copied. Provisioning reinforces it. For any non-PaaS type, \`scripts/scaffold-init.sh\` appends \`web/\`, \`scripts/\` and \`drush/\` to \`.gitignore\` and runs \`rm composer.*\`; for \`saas\` it additionally runs \`rm -r custom/composer\`. Neither \`saas\` nor \`saasplus\` ends up with a repo-root composer.json — \`saasplus\` differs only in keeping \`custom/composer\`.

### What is still yours

- \`themes/\` — the primary code extension point, and it does become \`web/themes/custom\`.
- \`config/default\` — everything a site builder produces, exported.
- \`favicon.ico\`, plus \`custom/ahoy.yml\` for project-local developer commands (useful, never built).

### What a theme may contain

More than most people expect. Per the wiki FAQ you can implement hooks like \`hook_form_alter()\`, theme hooks like \`hook_preprocess_node()\`, and "name-spaced classes in \`themes/mytheme/src\` which can be auto-loaded". A custom admin theme is fine — "an admin theme is just a theme so it's allowed". What you cannot do: "create new services (\`mytheme.services.yml\` and friends) as Drupal will not discover these", implement routes, or override another module's services. Procedural extension and plain autoloaded classes, yes; container participation, no.

### Locked, not merely ignored

Eight paths are write-protected on SaaS — \`.docker/*\`, \`.ahoy.yml\`, \`.env.default\`, \`.gitlab-ci.yml\`, \`.lagoon.yml\`, \`.version.yml\`, \`README.md\`, \`docker-compose.yml\` — and the wiki is blunt about the mechanism: pushes changing them "will be declined and the git push will fail."

### The gate that catches you

\`govcms-vet\` clones a fresh scaffold, provisions it with your \`.version.yml\` values and diffs, emitting numbered findings vet-001 to vet-007. vet-007 is the custom-module check; its comment reads "There is no known way to enable a Drupal module outside a \\"modules\\" directory", and it fails on any \`*.info.yml\` found under a \`web\` modules path. The script exits 0 for \`paas\` and 1 for \`saas\` and \`saasplus\`; in the vendored GitLab pipeline \`vet\` is the only job with \`allow_failure: false\`.

### The escape routes

1. **PaaS.** \`Dockerfile.paas\` runs \`composer install\` then \`COPY . /app\`. You own composer.json, \`web/modules/custom\`, the settings includes and \`.lagoon.yml\`.
2. **\`saasplus\`.** GovCMS markets two offerings, but the scaffold provisions a third type; it keeps \`custom/composer\`, merges that file's \`repositories\` into \`/app/composer.json\` and re-runs \`composer install\`.
3. **Into the distribution.** The FAQ accepts module requests via an issue template and warns the process is hard, because the distribution is regression-tested for every release.

None of this shifts between GovCMS 3.x and 4.x: \`ahoy init <name> <type> <version>\` takes \`10\` or \`11\` from the same scaffold, and only the composer.N.json and the image tag differ.`,
  comparisons: [
    {
      label: "Where a form alter is allowed to live",
      intro:
        "You need to relabel a field on one content type's node form. On a site you control this is a two-file custom module; on SaaS the same hook has to move into the theme.",
      php: `<?php

// web/modules/custom/mysite_core/mysite_core.module
// Paired with mysite_core.info.yml declaring "type: module".

use Drupal\\Core\\Form\\FormStateInterface;

/**
 * Implements hook_form_alter().
 */
function mysite_core_form_alter(array &$form, FormStateInterface $form_state, $form_id) {
  if ($form_id === 'node_publication_form') {
    $form['title']['widget'][0]['value']['#title'] = t('Publication title');
  }
}`,
      ts: `<?php

// themes/mysite/mysite.theme
// Reaches the server only because of: COPY themes/ /app/web/themes/custom

use Drupal\\Core\\Form\\FormStateInterface;

/**
 * Implements hook_form_alter().
 */
function mysite_form_alter(array &$form, FormStateInterface $form_state, $form_id) {
  if ($form_id === 'node_publication_form') {
    $form['title']['widget'][0]['value']['#title'] = t('Publication title');
  }
}`,
      note: "The hook body is identical — the catch is scope: a theme's hook implementations only fire while that theme is the active theme, so back-end alters belong in a custom admin theme, which SaaS explicitly permits.",
    },
    {
      label: "Sharing logic between hooks",
      intro:
        "The alter grows and you want it behind an injected, testable service. A custom module registers one in the container; a GovCMS theme can only offer an autoloaded class.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# web/modules/custom/mysite_core/mysite_core.services.yml
services:
  mysite_core.breadcrumb:
    class: Drupal\\mysite_core\\MysiteBreadcrumb
    arguments:
      - '@entity_type.manager'
      - '@config.factory'
    tags:
      - { name: breadcrumb_builder, priority: 100 }`,
      ts: `<?php

// themes/mysite/src/BreadcrumbHelper.php
// Autoloaded as Drupal\\mysite\\BreadcrumbHelper because themes get a PSR-4
// root at src/. There is deliberately no mysite.services.yml: Drupal does
// not scan themes for service definitions, so it would be dead weight.

namespace Drupal\\mysite;

use Drupal\\Core\\Entity\\EntityTypeManagerInterface;

class BreadcrumbHelper {

  protected EntityTypeManagerInterface $entityTypeManager;

  public function __construct(EntityTypeManagerInterface $entity_type_manager) {
    $this->entityTypeManager = $entity_type_manager;
  }

  public static function create(): static {
    return new static(\\Drupal::entityTypeManager());
  }

  public function parentLabel(int $nid): string {
    $node = $this->entityTypeManager->getStorage('node')->load($nid);
    return $node ? (string) $node->label() : '';
  }
}`,
      note: "You keep constructor injection and unit-testability, but you lose tagged services, event subscribers, routes and service overrides — when the requirement genuinely needs the container, that is the signal to price PaaS.",
    },
    {
      label: "Adding a contrib module",
      intro:
        "The site needs Webform. On a site you control that is a composer require; on SaaS Composer is not in your hands at all and the question becomes whether the module is already in the distribution.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# A Drupal site you control: Composer owns the module list.
composer require 'drupal/webform:^6.2'
vendor/bin/drush en -y webform webform_ui
vendor/bin/drush cex -y

git add composer.json composer.lock config/
git commit -m "Add Webform"
# Deploy rebuilds vendor/ from composer.lock on the target.`,
      ts: `# GovCMS SaaS: there is no composer.json. scaffold-init.sh ran
# "rm composer.*" at provisioning time, so this fails outright:
#   composer require drupal/webform   ->  no composer.json in ./

# The module set is the distribution's. What a site may enable is
# governed by module_permissions, whose managed_modules allowlist in
# scaffold-tooling's security.settings.php does include webform.
ahoy drush pm:list --status=disabled --no-core --format=table
ahoy drush en -y webform webform_ui
ahoy drush cex -y

# Only the exported config is deployable; note that config_ignore
# excludes webform.webform.* from config deployment by default.
git add config/default
git commit -m "Enable Webform"`,
      note: "The real skill here is reading the distribution's composer.json before you promise a feature: if the module is not already pinned there, no amount of SaaS repo work will install it.",
    },
    {
      label: "What the build actually ships",
      intro:
        "Compare the deploy artefact. A conventional Drupal image is built from your whole repository; the SaaS image is built from three directories, and you cannot edit the file that decides.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Dockerfile -- a Drupal 11 project you fully control.
FROM drupal:11-php8.3-fpm
WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --optimize-autoloader

# Your modules, your themes, your settings, your scripts.
COPY . /app
RUN chown -R www-data:www-data /app/web/sites/default/files`,
      ts: `# .docker/Dockerfile.saas -- renamed to .docker/Dockerfile.cli at init, and
# a locked path either way. A push that edits anything under .docker/* is
# declined and the git push fails.
ARG CLI_IMAGE
ARG GOVCMS_IMAGE_VERSION=11.x-latest
FROM govcms/govcms:\${GOVCMS_IMAGE_VERSION}

ENV WEBROOT=web

COPY themes/ /app/web/themes/custom
COPY config /app/config

# Default application favicon this will be used for files and server
# error pages all other favicon requests will be surfaced via Drupal.
COPY favicon.ico /app/web`,
      note: "Three COPY lines are the whole policy — anything you add outside themes/, config/ and favicon.ico is not rejected so much as ignored, which is why teams lose a sprint before they notice.",
    },
  ],
  playground: {
    intro:
      "A boundary linter over real scaffold paths. Ordered rules, first match wins — read the rule table, then predict each verdict before running it.",
    lang: "php",
    code: `<?php

// The GovCMS repo boundary, modelled as an ordered decision function.
// Each rule is [path prefix, filename suffix, SaaS verdict, PaaS verdict, reason].
// First match wins, so the specific rules must sit above the general ones.
$rules = [
  ['themes/', '.services.yml', 'DENY', 'DENY', 'Drupal never scans themes for services -- not a SaaS rule'],
  ['themes/', '', 'ALLOW', 'ALLOW', 'COPY themes/ /app/web/themes/custom'],
  ['config/', '', 'ALLOW', 'ALLOW', 'COPY config /app/config'],
  ['favicon.ico', '', 'ALLOW', 'ALLOW', 'COPY favicon.ico /app/web'],
  ['custom/composer/', '', 'DENY', 'ALLOW', 'scaffold-init.sh runs rm -r custom/composer for saas'],
  ['custom/', '', 'ALLOW', 'ALLOW', 'yours to edit, but local tooling only - never built'],
  ['web/modules/', '.info.yml', 'DENY', 'ALLOW', 'govcms-vet finding vet-007: custom module in the repo'],
  ['web/', '', 'DENY', 'ALLOW', 'scaffold-init.sh appends web/ to .gitignore for saas'],
  ['.docker/', '', 'DENY', 'ALLOW', 'locked path: the git push is declined'],
  ['.lagoon.yml', '', 'DENY', 'ALLOW', 'locked path on saas; agency-editable on paas'],
  ['composer.json', '', 'DENY', 'ALLOW', 'scaffold-init.sh runs rm composer.* for saas'],
  ['', '', 'DENY', 'ALLOW', 'no COPY line in Dockerfile.saas reaches this path'],
];

$paths = [
  'themes/mysite/mysite.theme',
  'themes/mysite/src/BreadcrumbHelper.php',
  'themes/mysite/mysite.services.yml',
  'config/default/core.extension.yml',
  'favicon.ico',
  'custom/ahoy.yml',
  'custom/composer/patches.json',
  'web/modules/custom/mysite_core/mysite_core.info.yml',
  'web/sites/default/settings.php',
  '.docker/Dockerfile.cli',
  '.lagoon.yml',
  'composer.json',
];

function classify(array $rules, string $path): array {
  foreach ($rules as $rule) {
    list($prefix, $suffix, $saas, $paas, $why) = $rule;
    $prefix_ok = ($prefix === '') || (strncmp($path, $prefix, strlen($prefix)) === 0);
    $suffix_ok = ($suffix === '') || (substr($path, -strlen($suffix)) === $suffix);
    if ($prefix_ok && $suffix_ok) {
      return ['saas' => $saas, 'paas' => $paas, 'why' => $why];
    }
  }
  return ['saas' => 'DENY', 'paas' => 'ALLOW', 'why' => 'unclassified'];
}

echo "GovCMS repo boundary linter -- offering type: saas vs paas\\n";
printf("%-52s %-6s %-6s %s\\n", 'REPO PATH', 'SaaS', 'PaaS', 'RULE THAT MATCHED');
echo str_repeat('-', 118) . "\\n";

$saas_denied = 0;
$paas_denied = 0;
foreach ($paths as $path) {
  $v = classify($rules, $path);
  if ($v['saas'] === 'DENY') {
    $saas_denied++;
  }
  if ($v['paas'] === 'DENY') {
    $paas_denied++;
  }
  printf("%-52s %-6s %-6s %s\\n", $path, $v['saas'], $v['paas'], $v['why']);
}

echo str_repeat('-', 118) . "\\n";
printf("SaaS: %d of %d paths denied. Only themes/, config/ and favicon.ico reach the image.\\n", $saas_denied, count($paths));
printf("PaaS: %d of %d paths denied. Dockerfile.paas runs composer install, then COPY . /app.\\n", $paas_denied, count($paths));
echo "Denied paths fail three different ways:\\n";
echo "  1. locked paths (.docker/*, .lagoon.yml) are declined at push time;\\n";
echo "  2. a force-added module .info.yml under web fails govcms-vet with vet-007;\\n";
echo "  3. everything else -- a theme services.yml included -- fails silently, never copied or never discovered.\\n";`,
    output: `GovCMS repo boundary linter -- offering type: saas vs paas
REPO PATH                                            SaaS   PaaS   RULE THAT MATCHED
----------------------------------------------------------------------------------------------------------------------
themes/mysite/mysite.theme                           ALLOW  ALLOW  COPY themes/ /app/web/themes/custom
themes/mysite/src/BreadcrumbHelper.php               ALLOW  ALLOW  COPY themes/ /app/web/themes/custom
themes/mysite/mysite.services.yml                    DENY   DENY   Drupal never scans themes for services -- not a SaaS rule
config/default/core.extension.yml                    ALLOW  ALLOW  COPY config /app/config
favicon.ico                                          ALLOW  ALLOW  COPY favicon.ico /app/web
custom/ahoy.yml                                      ALLOW  ALLOW  yours to edit, but local tooling only - never built
custom/composer/patches.json                         DENY   ALLOW  scaffold-init.sh runs rm -r custom/composer for saas
web/modules/custom/mysite_core/mysite_core.info.yml  DENY   ALLOW  govcms-vet finding vet-007: custom module in the repo
web/sites/default/settings.php                       DENY   ALLOW  scaffold-init.sh appends web/ to .gitignore for saas
.docker/Dockerfile.cli                               DENY   ALLOW  locked path: the git push is declined
.lagoon.yml                                          DENY   ALLOW  locked path on saas; agency-editable on paas
composer.json                                        DENY   ALLOW  scaffold-init.sh runs rm composer.* for saas
----------------------------------------------------------------------------------------------------------------------
SaaS: 7 of 12 paths denied. Only themes/, config/ and favicon.ico reach the image.
PaaS: 1 of 12 paths denied. Dockerfile.paas runs composer install, then COPY . /app.
Denied paths fail three different ways:
  1. locked paths (.docker/*, .lagoon.yml) are declined at push time;
  2. a force-added module .info.yml under web fails govcms-vet with vet-007;
  3. everything else -- a theme services.yml included -- fails silently, never copied or never discovered.
`,
  },
  keyPoints: [
    "The entire SaaS build payload is three lines of .docker/Dockerfile.saas: COPY themes/ /app/web/themes/custom, COPY config /app/config, COPY favicon.ico /app/web — nothing else in the repo enters the image.",
    "A theme is a real extension point: hooks, preprocess functions and autoloaded classes under themes/mytheme/src are all fine, and a custom admin theme is allowed because an admin theme is just a theme.",
    "What a theme cannot do is join the container — no mytheme.services.yml, no new services, no routes, no overriding another module's services.",
    "Provisioning removes the levers: for a saas project scaffold-init.sh appends web/, scripts/ and drush/ to .gitignore and deletes composer.* and custom/composer, so there is no Composer file to edit.",
    "Eight paths (.docker/*, .ahoy.yml, .env.default, .gitlab-ci.yml, .lagoon.yml, .version.yml, README.md, docker-compose.yml) are locked on SaaS — the wiki says such pushes are declined and the git push fails.",
    "govcms-vet is the CI gate: vet-007 fails on any custom module .info.yml under web, it exits 0 on paas and 1 on saas and saasplus, and vet is the one vendored GitLab job with allow_failure: false.",
  ],
  interview: [
    {
      q: "A client on GovCMS SaaS asks for a small custom module. Walk me through your answer.",
      a: "I would not start with the policy, I would start with the Dockerfile: on SaaS the built image only receives `themes/`, `config` and `favicon.ico`, so a `web/modules/custom` directory is never copied and the module simply will not exist on the server. Then I would try to land the requirement inside the boundary — most of what people want a module for is a `hook_form_alter()`, a preprocess function or a plain autoloaded class under `themes/mytheme/src`, all of which a theme can carry. If it genuinely needs a route, an event subscriber or a tagged service, it cannot live in a theme, and the conversation becomes PaaS, the scaffold's `saasplus` type, or getting the capability into the distribution. The thing I would flag from experience is that failure here is silent, not loud: nobody gets an error for committing a module, they get a site that behaves as if the code was never written, and `govcms-vet` reports it as finding vet-007 rather than the deploy exploding.",
    },
    {
      q: "How much PHP can you actually write on a GovCMS SaaS site?",
      a: "Quite a lot, as long as it is theme-shaped. The wiki FAQ is explicit that you can implement hooks such as `hook_form_alter()` and theme hooks such as `hook_preprocess_node()`, and that you can define namespaced classes in `themes/mytheme/src` that are autoloaded. The hard line is the service container: you cannot create `mytheme.services.yml` because Drupal will not discover it, so no event subscribers, no route subscribers, no service overrides, and none of the hooks that Drupal made module-only after Drupal 7. In practice I write helper classes with constructor injection and instantiate them from the `.theme` file, which keeps the code unit-testable even though it is never a registered service. There is also a scan over the theme directory for banned PHP functions such as `eval()`, `exec()` and `shell_exec()`, so theme PHP is not an unpoliced space.",
    },
    {
      q: "What stops a developer from just editing .lagoon.yml or the Dockerfile on SaaS?",
      a: "Git does. A set of paths — `.docker/*`, `.ahoy.yml`, `.env.default`, `.gitlab-ci.yml`, `.lagoon.yml`, `.version.yml`, `README.md` and `docker-compose.yml` — are locked by the platform team, and the wiki states that pushes changing them will be declined and the push will fail. That is a different failure mode from the module case: locked files fail at push time, custom code fails by never being copied. On PaaS those same files are yours; `.lagoon.yml` in particular names PaaS users or the support team as its editors in its own comment. I would still expect Shipshape to YAML-lint `.lagoon.yml` at high severity regardless of offering, so a syntactically broken file is a build problem on either side.",
    },
    {
      q: "The requirement can't fit in a theme. How do you choose between PaaS, saasplus and a distribution contribution?",
      a: "I weigh how much platform responsibility the client is willing to absorb. PaaS gives the most freedom — `Dockerfile.paas` runs `composer install` and then `COPY . /app`, so composer.json, `web/modules/custom` and `.lagoon.yml` are all yours — but you now own module currency, patching and security updates that SaaS was doing for you, and the platform validations block is stripped out of `.lagoon.yml` at provisioning. The scaffold's `saasplus` type sits in between: it keeps `custom/composer`, merges its `repositories` into the built composer.json and re-runs `composer install`, so you can add packages without taking on a full PaaS build; note that GovCMS markets two offerings publicly while the tooling provisions three, so I would confirm commercial availability rather than assume it. Contributing into the distribution is the cheapest long-term option for something several agencies need, but the FAQ is honest that it is slow, because the whole distribution is regression-tested at each release. My default recommendation is to exhaust the theme and site-building options first, since most 'we need a module' requests turn out to be a paragraph type, a view and a preprocess function.",
    },
  ],
  quiz: [
    {
      question:
        "Which set of repository paths is copied into a GovCMS SaaS image by .docker/Dockerfile.saas?",
      options: [
        "themes/, config, web/modules/custom and favicon.ico",
        "The whole repository, minus the paths in .dockerignore",
        "themes/, config and favicon.ico",
        "themes/, config, custom/composer and composer.json",
      ],
      answerIndex: 2,
      explain:
        "After FROM and ENV WEBROOT=web, the file's entire body is COPY themes/ /app/web/themes/custom, COPY config /app/config and COPY favicon.ico /app/web. Copying the whole repo is what Dockerfile.paas does.",
    },
    {
      question:
        "A developer adds themes/mysite/mysite.services.yml to register an event subscriber. What happens on SaaS?",
      options: [
        "The file is copied with the theme but Drupal never discovers it, so the subscriber never runs",
        "The git push is declined because service files are a locked path",
        "It works, because themes/ is copied to web/themes/custom and everything in it is loaded",
        "govcms-vet fails the build with vet-007",
      ],
      answerIndex: 0,
      explain:
        "COPY themes/ takes the whole directory, so the file arrives, but the wiki FAQ is explicit that Drupal will not discover services declared by a theme. vet-007 is about custom module .info.yml files under web, and locked paths are the platform-managed files like .docker/* and .lagoon.yml.",
    },
    {
      question:
        "What does scripts/scaffold-init.sh do to a project provisioned with type saas that it does not do for paas?",
      options: [
        "It deletes the themes/ directory, since SaaS themes come from the distribution",
        "It moves .gitlab-ci.paas.yml into place as .gitlab-ci.yml",
        "It removes the SaaS-only block from .lagoon.yml",
        "It appends web/, scripts/ and drush/ to .gitignore and removes composer.* and custom/composer",
      ],
      answerIndex: 3,
      explain:
        "The .gitignore append and the composer.* removal happen for any non-paas type; only the custom/composer removal is specific to saas. Deleting themes/ and swapping in the PaaS CI file are what the script does for paas, and the SaaS-only block is sed-deleted from .lagoon.yml for paas.",
    },
    {
      question:
        "In the vendored GitLab pipeline, what is the exit behaviour of govcms-vet?",
      options: [
        "It exits non-zero on every offering, and the job is always allow_failure: true",
        "It exits 0 for paas and 1 for saas and saasplus, and vet is the only job with allow_failure: false",
        "It exits 0 for saas and 1 for paas, because PaaS carries more risk",
        "It only reports, and enforcement happens later during the Lagoon post-rollout tasks",
      ],
      answerIndex: 1,
      explain:
        "The script sets ON_ERROR=0 for paas so PaaS teams see green but can inspect the warnings, and ON_ERROR=1 for saas and saasplus. Vet is the one job the pipeline will not let you soften, which is why it is the practical enforcement point for the code boundary.",
    },
  ],
};

export default lesson;
