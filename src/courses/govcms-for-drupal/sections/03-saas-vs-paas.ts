import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "saas-vs-paas",
  title: "SaaS vs PaaS: Where the Responsibility Line Falls",
  part: "Why GovCMS Exists",
  estMinutes: 13,
  summary:
    "GovCMS sells two offerings that differ in exactly one thing — who owns the application layer — and the whole job changes depending on which side of that line your site sits.",
  concept: `## Two offerings, one line through the stack

GovCMS markets **two** service offerings: Software as a Service and Platform as a Service. (The scaffold's provisioner also accepts a third *type*, \`saasplus\`, so the tooling and the marketing do not map one-to-one — know the difference, don't claim GovCMS sells three.)

govcms.gov.au states the split plainly. On SaaS, "we also maintain the security, application software, and infrastructure of a website". On PaaS, "we maintain the infrastructure of the platform" — and that "allows PaaS agencies more flexibility around what extensions they can use on their website."

### Read the inclusions table as a RACI

The published plans-at-a-glance table is the responsibility matrix, not a feature list:

- **Drupal security updates** — SaaS: Included. PaaS: *You're responsible*.
- **Drupal application maintenance** — SaaS: Included. PaaS: *You're responsible*.
- **IRAP assessed** — SaaS: Included. PaaS: *You're responsible*.
- **Drupal infrastructure maintenance** — Included on both.
- **Application and infrastructure support** — Unlimited on SaaS, Limited on PaaS.

PaaS does not lower the classification ceiling; the platform is certified to host information up to OFFICIAL: Sensitive either way. It moves who must *evidence* the application layer.

### The line is enforced in the build, not in a policy PDF

Run \`ahoy init <name> saas 11\` and \`scripts/scaffold-init.sh\` deletes every \`composer.*\` from your project and appends \`web/\`, \`scripts/\` and \`drush/\` to \`.gitignore\`. You cannot \`composer require\` anything, because there is nothing to require it into. The image build is the entire contract:

\`\`\`dockerfile
FROM govcms/govcms:11.x-latest
ENV WEBROOT=web
COPY themes/ /app/web/themes/custom
COPY config /app/config
COPY favicon.ico /app/web
\`\`\`

Themes, exported config, a favicon. Nothing else in your repository enters the running site. The theme is therefore the primary code extension point on SaaS — theme PHP, hooks, preprocess and autoloaded \`themes/mytheme/src\` classes all work; a \`mytheme.services.yml\`, a new route or a service override does not.

PaaS keeps a \`composer.json\` requiring \`govcms/govcms\`, \`govcms/scaffold-tooling\` and a local path package \`govcms/govcms-custom\` under \`custom/composer\`, with a \`patches-file\` at \`custom/composer/patches.json\`. \`Dockerfile.paas\` runs \`composer install\`, so your modules, your patches and your dependency tree are genuinely yours. \`project.settings.php\` is reachable; \`.lagoon.yml\` is agency-editable. On SaaS none of those are.

The tooling even encodes the asymmetry in its exit codes: \`govcms-vet\` sets \`ON_ERROR=0\` for \`paas\` and \`ON_ERROR=1\` for \`saas\` and \`saasplus\`. PaaS teams see warnings; SaaS teams see a failed job.

### The reframe that gets you hired

Interviewers are not asking which offering is better. They are asking whether you can turn a requirements list into a forced choice — and whether you know that some requirements do not get to be decided at all. govcms.gov.au is explicit: *"If your website uses authentication, collects personal information or payments, talk to us early."* The correct answer to those three is a conversation with GovCMS, not a scoring spreadsheet.`,
  comparisons: [
    {
      label: "Adding a contrib module",
      intro:
        "The most ordinary task in Drupal. On a site you control it is two commands; on GovCMS it is a question about which offering you bought.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal project you own end to end.
composer require drupal/paragraphs:^1.17
vendor/bin/drush pm:install paragraphs -y
vendor/bin/drush config:export -y
git add composer.json composer.lock config/
git commit -m "Add paragraphs"

# Deploy: your pipeline runs composer install, drush updb,
# drush config:import. You chose every one of those steps.`,
      ts: `# GovCMS SaaS: there is no composer.json to edit.
#   scripts/scaffold-init.sh -t saas  ->  rm composer.*
#   .gitignore gains: web/  scripts/  drush/
# Modules ship inside the govcms/govcms base image, and what a
# site may enable is gated by the managed_modules allowlist in
# scaffold-tooling's drupal/settings/security.settings.php.
ahoy pull                      # newer govcms/govcms image
ahoy drush pm:list --status=disabled --type=module

# GovCMS PaaS: composer is yours again.
composer require drupal/paragraphs:^1.17
ahoy drush pm:install paragraphs -y
git commit -am "Add paragraphs"   # composer.json IS tracked`,
      note:
        "On SaaS the absence of composer.json is not a convention you could break — the provisioner removed the file and gitignored web/, so there is no code path from your repo to a new contrib module.",
    },
    {
      label: "Shipping custom PHP",
      intro:
        "A banner that reads a config value and renders on every page. Idiomatic Drupal makes it a module with a service; SaaS makes it theme PHP.",
      php: `<?php

// web/modules/custom/agency_alerts/src/BannerBuilder.php
namespace Drupal\\agency_alerts;

use Drupal\\Core\\Config\\ConfigFactoryInterface;

class BannerBuilder {

  public function __construct(
    protected ConfigFactoryInterface $configFactory,
  ) {}

  public function build(): array {
    $text = $this->configFactory
      ->get('agency_alerts.settings')
      ->get('banner_text');
    if ($text === NULL || $text === '') {
      return [];
    }
    return [
      '#markup' => $text,
      '#cache' => ['tags' => ['config:agency_alerts.settings']],
    ];
  }

}

// agency_alerts.services.yml registers it:
//   agency_alerts.banner:
//     class: Drupal\\agency_alerts\\BannerBuilder
//     arguments: ['@config.factory']`,
      ts: `<?php

// themes/agency_theme/src/BannerBuilder.php
// On build this becomes web/themes/custom/agency_theme/src/...
// and Drupal autoloads it under the theme's namespace.
namespace Drupal\\agency_theme;

use Drupal\\Core\\Config\\ConfigFactoryInterface;

class BannerBuilder {

  public function __construct(
    protected ConfigFactoryInterface $configFactory,
  ) {}

  public function build(): array {
    $text = $this->configFactory
      ->get('agency_theme.settings')
      ->get('banner_text');
    if ($text === NULL || $text === '') {
      return [];
    }
    return [
      '#markup' => $text,
      '#cache' => ['tags' => ['config:agency_theme.settings']],
    ];
  }

}

// themes/agency_theme/agency_theme.theme
function agency_theme_preprocess_page(array &$variables): void {
  $builder = new \\Drupal\\agency_theme\\BannerBuilder(
    \\Drupal::configFactory()
  );
  $variables['agency_banner'] = $builder->build();
}`,
      note:
        "The class survives the move; the container registration does not. A theme may not ship a services.yml, declare a route or override a core service — so on SaaS you construct collaborators yourself. On PaaS the left-hand module is fine as written.",
    },
    {
      label: "What actually gets built",
      intro:
        "Same repository layout, two completely different build contracts. This file is where the responsibility line becomes a set of COPY instructions.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Vanilla Drupal: your Dockerfile, your call.
FROM php:8.3-fpm-alpine

WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --optimize-autoloader

COPY web/modules/custom /app/web/modules/custom
COPY web/themes/custom /app/web/themes/custom
COPY config /app/config
COPY patches /app/patches

# You pick the PHP version, the extensions, the base image,
# the layer order and what is allowed into the artefact.`,
      ts: `# .version.yml -- the platform reads this to decide what runs.
version: 11
type: saas
scaffold: 4.0.0

# .docker/Dockerfile.saas -- the ENTIRE body after FROM/ENV.
# scaffold-init.sh renames this file to .docker/Dockerfile.cli, which is the
# name you will actually find in a provisioned repo.
ARG CLI_IMAGE
ARG GOVCMS_IMAGE_VERSION=11.x-latest
FROM govcms/govcms:\${GOVCMS_IMAGE_VERSION}
ENV WEBROOT=web
COPY themes/ /app/web/themes/custom
COPY config /app/config
COPY favicon.ico /app/web

# .docker/Dockerfile.paas -- your dependency tree, built.
FROM govcms/govcms:11.x-latest
ENV WEBROOT=web
COPY composer.* /app/
COPY scripts /app/scripts
COPY custom /app/custom
RUN composer install --no-dev --no-interaction --no-suggest
COPY . /app`,
      note:
        "Which pipeline you get is decided once, at provisioning: for `paas`, scaffold-init.sh sed-deletes the `## START SaaS-only` / `## END SaaS-only` block from .lagoon.yml, removing the Shipshape validation task — then the script deletes itself. Afterwards `type:` in .version.yml no longer controls that; it is what `govcms-vet` and the GovCMS automated tasks read at runtime, while Lagoon simply runs whatever is literally in your .lagoon.yml.",
    },
    {
      label: "Who ships the security update",
      intro:
        "A Drupal core SA lands on a Wednesday. Trace who is on the hook under each model — this is the single row of the inclusions table that decides staffing.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# You own it, start to finish.
composer update drupal/core-recommended \\
  drupal/core-composer-scaffold --with-dependencies
vendor/bin/drush updatedb -y
vendor/bin/drush cache:rebuild
vendor/bin/phpunit --testsuite=functional

git commit -am "Core security update"
git push origin main       # your pipeline, your rollback plan

# Your team carries the SA watch, the regression suite and the
# out-of-hours page. Nobody else is watching the advisories.`,
      ts: `# SaaS -- "Drupal security updates: Included".
# The distribution is patched upstream and the platform rebuilds
# from a newer govcms/govcms image. You have no composer.json,
# so there is no version for you to bump. Locally:
ahoy pull
ahoy up

# PaaS -- "Drupal security updates: You're responsible".
# You pin govcms/govcms in YOUR composer.json, so you bump it.
composer update govcms/govcms govcms/scaffold-tooling \\
  --with-dependencies
ahoy drush updatedb -y
git commit -am "GovCMS distribution update"
git push                   # Lagoon rebuilds from your lockfile`,
      note:
        "Infrastructure maintenance is Included on both plans; application maintenance and IRAP assessment are Included on SaaS and 'You're responsible' on PaaS. PaaS buys extension freedom by buying back a maintenance obligation.",
    },
  ],
  playground: {
    intro:
      "A requirements intake, scored. Watch the rule, not the total: one requirement the SaaS build contract cannot host outranks every weight on the board — here the totals lean SaaS and the verdict is still PaaS.",
    lang: "php",
    code: `<?php

// Eight requirements off a real discovery call. Weights are fixed
// integers -- how hard each requirement pulls toward each offering.
$intake = [
  ['need' => 'Ship a custom Drupal module',   'saas' => 0, 'paas' => 3, 'early' => FALSE],
  ['need' => 'SAML single sign-on',           'saas' => 1, 'paas' => 2, 'early' => TRUE],
  ['need' => 'Take card payments',            'saas' => 1, 'paas' => 1, 'early' => TRUE],
  ['need' => 'Standard brochure site',        'saas' => 3, 'paas' => 0, 'early' => FALSE],
  ['need' => 'Bespoke infrastructure sizing', 'saas' => 0, 'paas' => 3, 'early' => FALSE],
  ['need' => 'Finance to own security',       'saas' => 3, 'paas' => 0, 'early' => FALSE],
  ['need' => 'No in-house Drupal team',       'saas' => 3, 'paas' => 0, 'early' => FALSE],
  ['need' => 'Collects personal information', 'saas' => 1, 'paas' => 1, 'early' => TRUE],
];

// THE RULE, in two parts.
// 1. saas == 0 && paas > 0  =>  FORCING. The SaaS build contract has
//    nowhere to put it, so no counter-weight rescues SaaS.
// 2. Only when nothing forces do the weights decide, on totals.
//
// Authentication, personal information and payments are deliberately
// NOT forcing. govcms.gov.au lists them as "talk to us early" special
// functions, not as SaaS exclusions -- the distribution even bundles
// an SSO module (it ships off, and is absent from the managed_modules
// allowlist), so those rows are a procurement conversation rather than
// a technical impossibility. They carry an 'early' flag, not a zero.
function leans(array $r): string {
  if ($r['saas'] === $r['paas']) {
    return 'either';
  }
  return $r['saas'] > $r['paas'] ? 'SaaS' : 'PaaS';
}

function forces(array $r): bool {
  return $r['saas'] === 0 && $r['paas'] > 0;
}

printf("GovCMS offering recommender -- %d requirements\\n", count($intake));
printf("%-30s %4s %4s %-7s %-8s %s\\n",
  'REQUIREMENT', 'SAAS', 'PAAS', 'LEANS', 'FORCING', 'EARLY');
echo str_repeat('-', 64) . "\\n";

$saasTotal = 0;
$paasTotal = 0;
$forced = [];
$early = [];

foreach ($intake as $r) {
  $saasTotal += $r['saas'];
  $paasTotal += $r['paas'];
  if (forces($r)) {
    $forced[] = $r['need'];
  }
  if ($r['early']) {
    $early[] = $r['need'];
  }
  printf("%-30s %4d %4d %-7s %-8s %s\\n",
    $r['need'], $r['saas'], $r['paas'], leans($r),
    forces($r) ? 'yes' : 'no',
    $r['early'] ? 'yes' : '-');
}

echo str_repeat('-', 64) . "\\n";
printf("%-30s %4d %4d\\n", 'TOTALS', $saasTotal, $paasTotal);

if (count($forced) > 0) {
  $verdict = 'PaaS';
  $why = sprintf('%d requirement(s) the SaaS build contract cannot host', count($forced));
}
elseif ($paasTotal > $saasTotal) {
  $verdict = 'PaaS';
  $why = 'weighted preference only -- revisit if extension needs drop';
}
else {
  $verdict = 'SaaS';
  $why = 'nothing forces the application layer back to the agency';
}

printf("RECOMMENDATION: %s (SaaS %d / PaaS %d) -- %s\\n",
  $verdict, $saasTotal, $paasTotal, $why);

echo "\\nForcing requirements:\\n";
foreach ($forced as $f) {
  printf("  * %s\\n", $f);
}

echo "\\nTALK TO GOVCMS EARLY (authentication, personal info, payments):\\n";
foreach ($early as $e) {
  printf("  * %s\\n", $e);
}`,
    output: `GovCMS offering recommender -- 8 requirements
REQUIREMENT                    SAAS PAAS LEANS   FORCING  EARLY
----------------------------------------------------------------
Ship a custom Drupal module       0    3 PaaS    yes      -
SAML single sign-on               1    2 PaaS    no       yes
Take card payments                1    1 either  no       yes
Standard brochure site            3    0 SaaS    no       -
Bespoke infrastructure sizing     0    3 PaaS    yes      -
Finance to own security           3    0 SaaS    no       -
No in-house Drupal team           3    0 SaaS    no       -
Collects personal information     1    1 either  no       yes
----------------------------------------------------------------
TOTALS                           12   10
RECOMMENDATION: PaaS (SaaS 12 / PaaS 10) -- 2 requirement(s) the SaaS build contract cannot host

Forcing requirements:
  * Ship a custom Drupal module
  * Bespoke infrastructure sizing

TALK TO GOVCMS EARLY (authentication, personal info, payments):
  * SAML single sign-on
  * Take card payments
  * Collects personal information
`,
  },
  keyPoints: [
    "GovCMS publicly markets two offerings, SaaS and PaaS; the scaffold's provisioner also accepts a third type, `saasplus`, so tooling and marketing are not the same list.",
    "The published inclusions table is a responsibility matrix: Drupal security updates, application maintenance and IRAP assessment are Included on SaaS and 'You're responsible' on PaaS, while infrastructure maintenance is Included on both.",
    "SaaS enforces the line in the build — `scaffold-init.sh` deletes `composer.*` and gitignores `web/`, and `.docker/Dockerfile.saas` copies only `themes/`, `config` and `favicon.ico` into the image.",
    "The theme is the primary code extension point on SaaS: theme hooks, preprocess and autoloaded `themes/mytheme/src` classes are allowed; a services.yml, a new route or a service override is not.",
    "PaaS restores composer — `govcms/govcms`, `govcms/scaffold-tooling` and a local `govcms/govcms-custom` path package under `custom/composer`, with patches via `custom/composer/patches.json`.",
    "Authentication, personal information and payments are not scoring inputs — govcms.gov.au says talk to GovCMS early about all three, whichever offering you are leaning toward.",
  ],
  interview: [
    {
      q: "A client wants a GovCMS site with a bespoke booking workflow. Which offering, and why?",
      a: "A bespoke workflow means custom PHP that is not theme code, so SaaS cannot host it — `.docker/Dockerfile.saas` copies only `themes/`, `config` and `favicon.ico` into the image, and the SaaS provisioner deletes `composer.*` outright. That makes it PaaS, where `Dockerfile.paas` runs `composer install` over your own `composer.json` and a local `custom/composer` path package. But I would push back before agreeing to build it: I would check whether the workflow can be expressed with what the distribution already ships, because moving to PaaS also moves Drupal security updates, application maintenance and IRAP assessment onto the agency. If the booking flow involves authentication or payments, that is a conversation with GovCMS before any offering is chosen, not after.",
    },
    {
      q: "What can a SaaS site actually customise, if it cannot ship modules?",
      a: "A full custom theme, and that is more than people assume — theme hooks, `hook_preprocess_*`, Twig, libraries, and PHP classes autoloaded from `themes/mytheme/src` under the theme namespace. The GovCMS wiki even notes an admin theme is just a theme, so it is allowed. What you cannot do is register services: no `mytheme.services.yml`, no new routes, no service overrides — so anything that needs a container entry has to be rewritten as direct instantiation or dropped. Beyond the theme, you customise through exported configuration in `config/default`, and through whatever the `managed_modules` allowlist in scaffold-tooling's `security.settings.php` lets the site enable.",
    },
    {
      q: "How do you explain the shared-responsibility model to a non-technical agency stakeholder?",
      a: "I use the published plans-at-a-glance table, because it is already written as a RACI. On SaaS, GovCMS maintains the security, the application software and the infrastructure; on PaaS they maintain the infrastructure of the platform and the rest comes back to you. The rows that matter to a budget conversation are Drupal security updates, Drupal application maintenance and IRAP assessed — all Included on SaaS, all 'You're responsible' on PaaS — plus support, which is unlimited on SaaS and limited on PaaS. I frame PaaS as buying extension freedom by buying back a maintenance obligation, and I make sure someone owns the Drupal security advisory watch before we sign.",
    },
    {
      q: "You have inherited a PaaS project. What do you check in the first hour?",
      a: "`.version.yml` first, because `type:` is what `govcms-vet` and the GovCMS automated tasks read, and I want to confirm it really is `paas` and not `saasplus`. Then `.lagoon.yml`, because the post-rollout tasks Lagoon runs are whatever is literally in that file — the SaaS-only validation block was stripped once at provisioning and nothing puts it back. Then `composer.json` — how far behind `govcms/govcms` and `govcms/scaffold-tooling` are, and what is in `custom/composer/patches.json`, because on PaaS nobody else is bumping those. `.lagoon.yml` is agency-editable on PaaS, so I also look for altered tasks or a `GOVCMS_SKIP_*` variable. I would also run the vetting job knowing it exits 0 on PaaS by design — `govcms-vet` sets `ON_ERROR=0` for `paas` — so a green CI badge there proves nothing and the job log has to be read.",
    },
  ],
  quiz: [
    {
      question:
        "On a GovCMS SaaS project, why can't you add a contrib module with `composer require`?",
      options: [
        "The composer.json exists but a git hook rejects any commit that changes it",
        "Composer is available, but the module would be uninstalled by the deploy tasks",
        "`scripts/scaffold-init.sh` removes every `composer.*` file from a SaaS project, and `web/` is gitignored",
        "Contrib modules are allowed, but only if they are also listed in `.lagoon.yml`",
      ],
      answerIndex: 2,
      explain:
        "The SaaS branch of scaffold-init.sh runs `rm composer.*` and appends `web/`, `scripts/` and `drush/` to `.gitignore`. There is no dependency file to edit and no tracked web root to install into — the restriction is structural, not a policy check.",
    },
    {
      question:
        "Which row of the published GovCMS plans-at-a-glance table reads 'Included' for BOTH SaaS and PaaS?",
      options: [
        "Drupal infrastructure maintenance",
        "Drupal security updates",
        "IRAP assessed",
        "Drupal application maintenance",
      ],
      answerIndex: 0,
      explain:
        "Infrastructure maintenance is Included on both offerings — GovCMS runs the platform either way. Security updates, application maintenance and IRAP assessment all read 'You're responsible' on PaaS. That is precisely the application-layer line.",
    },
    {
      question:
        "A SaaS site needs a PHP class that reads config and builds a render array. What is the supported home for it?",
      options: [
        "A module under `web/modules/custom`, committed to the repo root",
        "A `mytheme.services.yml` entry so it can be injected properly",
        "A PHP file in `config/default` loaded during config import",
        "`themes/mytheme/src`, autoloaded under the theme namespace and instantiated directly",
      ],
      answerIndex: 3,
      explain:
        "The theme is the code extension point on SaaS: repo-root `themes/` is copied to `web/themes/custom` and classes in `themes/mytheme/src` autoload under the theme namespace. What a theme may not do is register services, so the class is constructed directly rather than injected via a services.yml.",
    },
    {
      question:
        "What does `govcms-vet` do differently on a `paas` project compared with `saas`?",
      options: [
        "It skips the codebase comparison entirely on PaaS",
        "It sets `ON_ERROR=0` on PaaS, so problems are reported but the job still exits green",
        "It runs Shipshape on PaaS instead of the scaffold diff",
        "It fails PaaS builds harder, because PaaS owns application security",
      ],
      answerIndex: 1,
      explain:
        "The script branches on the flavour: `ON_ERROR=0` for `paas`, `ON_ERROR=1` for `saas` and `saasplus`. Its own comment says PaaS users will see green in their CI but can inspect the job for warnings — so on PaaS a passing job is not evidence of a clean codebase.",
    },
  ],
};

export default lesson;
