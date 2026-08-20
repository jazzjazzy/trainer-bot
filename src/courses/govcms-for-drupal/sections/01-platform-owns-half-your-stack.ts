import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "platform-owns-half-your-stack",
  title: "The Platform Owns Half Your Stack: The GovCMS Mental Model",
  part: "Why GovCMS Exists",
  estMinutes: 13,
  summary:
    "On GovCMS the boundary between your problem and someone else's is a written shared-responsibility model whose shape changes with the offering the agency bought — so the first question stops being 'how do I build this' and becomes 'who owns this layer, and will the platform let me'.",
  concept: `## The boundary is a document, not an invoice

On a Drupal engagement you control, the line between your problem and someone
else's is a hosting invoice. You can always cross it: shell in, add a service,
edit \`php.ini\`, pin a different core release, argue with the host afterwards.

On GovCMS that line is written down, enforced by build tooling, and its shape
changes with the offering the agency bought. Nothing about your Drupal skill
tells you where it sits. So this course installs one reflex, and everything
after it is detail:

1. **Who owns this layer?**
2. **Will the platform let me?**

Ask those before "how do I build this". A thing being possible in Drupal says
nothing about whether it survives a GovCMS deploy.

### Why the guardrails are that tight

GovCMS is a whole-of-government platform run by the Department of Finance. Its
own \`/why-govcms\` video says it "hosts over 370 websites for more than 115
agencies across all levels of government in Australia" — the live homepage
counters read higher and keep moving. Every constraint you are about to meet
has to hold for all of them at once, under one accreditation: GovCMS is
certified to host information up to **OFFICIAL: Sensitive**.

The current baseline is GovCMS 4.x on Drupal 11. The distribution's
\`4.x-develop\` branch pins Drupal 11.4.5; the \`4.5.0.1\` release shipped 11.3.14.
Say which one you mean — an interviewer will notice.

### Two offerings, three project types

Public pricing names **two**: SaaS and PaaS. The \`/pricing\` "plans at a glance"
table is the shared-responsibility model in its shortest form:

| Concern | SaaS | PaaS |
| --- | --- | --- |
| Drupal infrastructure maintenance | Included | Included |
| Backups | Included | Included |
| Drupal security updates | Included | You're responsible |
| Drupal application maintenance | Included | You're responsible |
| IRAP assessed | Included | You're responsible |
| Web protection — CDN, WAF and DDOS | Included | Optional |
| Application support | Unlimited | Limited |

Read *Included* as "the platform owns it and you may not touch it", not as
"free". That is why, on SaaS, this set of files is locked — the wiki says
pushes changing them "will be declined and the git push will fail":

\`\`\`text
.docker/*  .ahoy.yml  .env.default  .gitlab-ci.yml
.lagoon.yml  .version.yml  README.md  docker-compose.yml
\`\`\`

The scaffold tooling knows about a third project type. \`ahoy init <name> <type>
<version>\` accepts \`saas\`, \`paas\` or \`saasplus\`, with version \`10\` or \`11\`.
GovCMS markets two offerings; the tooling provisions three. Keep those separate
in an interview.

### What the split actually feels like

- **Infrastructure** — containers, Kubernetes, the database service, backups,
  monitoring — is the platform's on both offerings.
- **The application layer** — core security releases, module maintenance,
  accreditation — is the platform's on SaaS and yours on PaaS.
- **Code and content** are yours on both. But *yours* is not *shippable*: on
  SaaS only \`themes/\`, \`config\` and \`favicon.ico\` are copied into the image.

That last line is the whole course in miniature. Owning something and being
permitted to deploy it are different questions, and GovCMS answers them
separately.`,
  comparisons: [
    {
      label: "What actually becomes production",
      intro:
        "You have a release ready. On a site you control, the repository is the deployment artefact. Ask what the platform does with your repository instead.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal: the repo IS the artefact. Everything in it ships.
git push origin main

# ...and on the target, the whole tree is present and buildable:
composer install --no-dev --optimize-autoloader
drush deploy                 # updb, cim, cr, deploy hooks
drush state:set system.maintenance_mode 0 --input-format=integer`,
      ts: `# .docker/Dockerfile.saas -- renamed to .docker/Dockerfile.cli by
# scaffold-init.sh, and a locked file under either name; you cannot edit it.
# This is its entire body. Nothing else in your repo enters the image.
ARG CLI_IMAGE
ARG GOVCMS_IMAGE_VERSION=11.x-latest

FROM govcms/govcms:\${GOVCMS_IMAGE_VERSION}

ENV WEBROOT=web

COPY themes/ /app/web/themes/custom
COPY config /app/config
COPY favicon.ico /app/web`,
      note: "On SaaS the platform supplies Drupal, the profile and ~102 pinned drupal/* packages in the base image; your repo contributes three COPY lines. modules/custom is not one of them — and a SaaS project has no composer.json to edit at all: scaffold-init.sh deletes the root composer.* files for saas and saasplus, and removes custom/composer for saas, so the repo carries no dependency file.",
    },
    {
      label: "Turning a module on",
      intro:
        "The most common interview trap: describe how you add a contrib module. On vanilla Drupal it is two commands. On GovCMS a contrib module (drupal/module_permissions) decides for you.",
      leftLang: "bash",
      rightLang: "php",
      php: `# You own the codebase, so you own the decision.
composer require drupal/webform
drush en webform -y
drush config:export -y
git add composer.json composer.lock config/
git commit -m "Add webform"`,
      ts: `<?php

// scaffold-tooling: drupal/settings/security.settings.php, included on every
// environment. The allow list has 73 entries; the first three are shown.
$config['module_permissions.settings']['managed_modules'] = [
  'bigmenu',
  'block_content',
  'captcha',
];

// The gatekeeper protects itself.
$config['module_permissions.settings']['protected_modules'] = [
  'module_permissions',
  'module_permissions_ui',
];

// Four permissions nobody on the site may hold.
$config['module_permissions.settings']['permission_blacklist'] = [
  'administer modules',
  'administer permissions',
  'administer search_api',
  'assign all roles',
];`,
      note: "This — not the deploy validators — is what restricts which modules a site may enable. 'administer modules' is denied outright, so /admin/modules is not a route out of it. Whether a given site's delegated role reaches any particular name on that list is site policy, not something the repo tells you.",
    },
    {
      label: "Protecting the database before a release",
      intro:
        "Every experienced Drupal developer has a pre-deploy snapshot habit. On GovCMS the habit is already a platform task, and on SaaS you cannot switch it off.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `# Your cron, your bucket, your retention policy, your problem.
drush sql:dump --gzip --result-file=/backups/pre-deploy.sql
aws s3 cp /backups/pre-deploy.sql.gz s3://acme-backups/prod/
drush deploy || aws s3 cp s3://acme-backups/prod/pre-deploy.sql.gz .`,
      ts: `# .lagoon.yml -- locked on SaaS, agency-editable on PaaS.
tasks:
  pre-rollout:
    - run:
        name: Snapshot the database and store
        command: "[ -f /app/vendor/bin/govcms-db-backup ] && /app/vendor/bin/govcms-db-backup || echo 'Database backup is not available.'"
        service: cli
        shell: bash
        when: withDefault("GOVCMS_SKIP_PRE_DEPLOY_DB_BACKUP", false) == false
    - run:
        name: Snapshot the config and store
        command: "[ -f /app/vendor/bin/govcms-config-backup ] && /app/vendor/bin/govcms-config-backup || echo 'Config backup is not available.'"
        service: cli
        shell: bash
        when: withDefault("GOVCMS_SKIP_PRE_DEPLOY_CONFIG_BACKUP", false) == false`,
      note: "Backups are 'Included' on both offerings. The difference is authorship: the file's own comment names 'PaaS users or the support team' as its editors, so on PaaS you can set GOVCMS_SKIP_PRE_DEPLOY_DB_BACKUP and on SaaS you cannot even open the file.",
    },
    {
      label: "Adding a search backend",
      intro:
        "A stakeholder wants faceted search. On your own stack that is a compose service and a composer require. Check what the same decision costs on GovCMS.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# docker-compose.yml -- yours to edit, so you just add the service.
services:
  solr:
    image: solr:9
    ports:
      - "8983:8983"
    command:
      - solr-precreate
      - drupal
      - /opt/solr/server/solr/configsets/search_api_solr`,
      ts: `# docker-compose.yml -- ships like this, commented out, in every scaffold.
  # Uncomment to enable solr.
  # solr:
  #   build:
  #     context: .
  #     dockerfile: .docker/Dockerfile.solr
  #     args:
  #       GOVCMS_IMAGE_VERSION: *govcms-image-version
  #   labels:
  #     lagoon.type: solr
  #   ports:
  #     - "8983"
  #   depends_on:
  #     - cli`,
      note: "Solr is available on all three project types and opt-in on all of them: scaffold-init.sh moves Dockerfile.solr.saas, .saasplus or .paas into place regardless. But docker-compose.yml is a locked file on SaaS, so 'uncomment it' is a service-desk conversation rather than a commit — and no deploy task reindexes for you.",
    },
  ],
  playground: {
    intro:
      "The reflex as a function. Ownership is not memorised concern by concern — it falls out of the layer a concern sits in, plus the offering. Read the two rules, then predict the tally before you run it.",
    lang: "php",
    code: `<?php

// Rule 1: a layer has an owner, and the owner changes with the offering.
$layerOwner = [
  'infra'   => ['saas' => 'Platform', 'paas' => 'Platform'],
  'edge'    => ['saas' => 'Platform', 'paas' => 'Agency'],
  'app'     => ['saas' => 'Platform', 'paas' => 'Agency'],
  'code'    => ['saas' => 'Agency',   'paas' => 'Agency'],
  'content' => ['saas' => 'Agency',   'paas' => 'Agency'],
];

// Rule 2 (SaaS only): the three COPY lines in .docker/Dockerfile.saas are the
// only paths in your repo that reach the image.
$saasShipPath = ['themes/', 'config', 'favicon.ico'];

// concern, layer, repo path the concern is authored in ('' = not code)
$concerns = [
  ['OS and container image patching', 'infra',   ''],
  ['Drupal core security release',    'app',     ''],
  ['Custom module code',              'code',    'modules/custom'],
  ['Web protection: CDN, WAF, DDoS',  'edge',    ''],
  ['Scheduled database backup',       'infra',   ''],
  ['Uptime monitoring',               'infra',   ''],
  ['Content and editorial workflow',  'content', ''],
  ['Custom theme',                    'code',    'themes/'],
  ['Solr service and index sizing',   'app',     ''],
  ['WCAG Level AA conformance',       'content', ''],
];

function resolve(array $concern, string $offering, array $owners, array $ship) {
  $layer = $concern[1];
  $path  = $concern[2];
  $owner = $owners[$layer][$offering];
  // You can own the code and still have no way to deploy it.
  if ($offering === 'saas' && $layer === 'code' && !in_array($path, $ship, true)) {
    return $owner . ' *';
  }
  return $owner;
}

printf("%-33s %-8s %-11s %-11s\\n", 'CONCERN', 'LAYER', 'SaaS', 'PaaS');
printf("%s\\n", str_repeat('-', 66));

$platformCount = ['saas' => 0, 'paas' => 0];
foreach ($concerns as $concern) {
  $row = [];
  foreach (['saas', 'paas'] as $offering) {
    $row[$offering] = resolve($concern, $offering, $layerOwner, $saasShipPath);
    if (strpos($row[$offering], 'Platform') === 0) {
      $platformCount[$offering]++;
    }
  }
  printf("%-33s %-8s %-11s %-11s\\n", $concern[0], $concern[1], $row['saas'], $row['paas']);
}

$total = count($concerns);
printf("%s\\n", str_repeat('-', 66));
printf("Platform owns %d of %d on SaaS, %d of %d on PaaS.\\n",
  $platformCount['saas'], $total, $platformCount['paas'], $total);
printf("* yours to write, no path into the SaaS image (%s).\\n",
  implode(', ', $saasShipPath));
printf("%s\\n", 'Ask who owns the layer before asking how to build the thing.');`,
    output: `CONCERN                           LAYER    SaaS        PaaS       
------------------------------------------------------------------
OS and container image patching   infra    Platform    Platform   
Drupal core security release      app      Platform    Agency     
Custom module code                code     Agency *    Agency     
Web protection: CDN, WAF, DDoS    edge     Platform    Agency     
Scheduled database backup         infra    Platform    Platform   
Uptime monitoring                 infra    Platform    Platform   
Content and editorial workflow    content  Agency      Agency     
Custom theme                      code     Agency      Agency     
Solr service and index sizing     app      Platform    Agency     
WCAG Level AA conformance         content  Agency      Agency     
------------------------------------------------------------------
Platform owns 6 of 10 on SaaS, 3 of 10 on PaaS.
* yours to write, no path into the SaaS image (themes/, config, favicon.ico).
Ask who owns the layer before asking how to build the thing.
`,
  },
  keyPoints: [
    "The GovCMS reflex is two questions before the build question: who owns this layer, and will the platform let me? Drupal fluency answers neither.",
    "Public pricing names two offerings, SaaS and PaaS; the scaffold tooling provisions three project types — `saas`, `paas` and `saasplus` — via `ahoy init <name> <type> <version>`.",
    "The /pricing 'plans at a glance' table is the shared-responsibility model: infrastructure maintenance and backups are Included on both, while Drupal security updates, application maintenance and IRAP assessment move to the agency on PaaS.",
    "'Included' means the platform owns that layer and you may not touch it — which is why `.docker/*`, `.lagoon.yml`, `docker-compose.yml`, `.gitlab-ci.yml`, `.ahoy.yml`, `.env.default`, `.version.yml` and `README.md` are locked on SaaS and a push changing them is declined.",
    "Owning code and being able to ship it are separate questions: `.docker/Dockerfile.saas` copies only `themes/`, `config` and `favicon.ico` into the image, so the theme is the primary code extension point on SaaS.",
    "GovCMS is certified to host information up to OFFICIAL: Sensitive across a fleet its own /why-govcms video puts at over 370 websites for more than 115 agencies — the guardrails are fleet-wide, not tuned to your site.",
  ],
  interview: [
    {
      q: "Explain the difference between GovCMS SaaS and PaaS to someone who knows Drupal but not GovCMS.",
      a: "Both offerings run the same GovCMS distribution on the same Lagoon-on-Kubernetes infrastructure, and on both the platform maintains the infrastructure layer and takes backups. The split is the **application layer**: on SaaS the GovCMS team owns Drupal security updates, application maintenance and the IRAP-assessed security posture, and web protection — CDN, WAF and DDoS — is included; on PaaS the pricing table says plainly that you're responsible for those, and web protection becomes optional. In exchange PaaS gives back control: `.lagoon.yml` and `composer.json` are yours, so you can add services, add modules and shape the rollout. The practical tell is the locked-file list — on SaaS a push touching `.docker/*`, `.lagoon.yml` or `docker-compose.yml` is declined at the git layer, which is a conversation I would rather have during scoping than mid-sprint.",
    },
    {
      q: "A client on SaaS asks for a small custom module — a block plugin that calls an internal API. How do you respond?",
      a: "First I check the ship path, not the design. `.docker/Dockerfile.saas` copies exactly three things into the image: `themes/`, `config` and `favicon.ico`. A directory called `modules/custom` in the repo is never built, so the module cannot exist in production no matter how well it is written. Then I look for the same outcome inside the sanctioned surface: theme PHP is allowed — hooks, preprocess functions and autoloaded classes under `themes/mytheme/src` — so a fair amount of behaviour is reachable, though a `mytheme.services.yml` with new services or routes is not. If the requirement genuinely needs a service or a route, that is a service-desk conversation about the module allow list or a case for PaaS, and I would raise it early rather than build it and discover the answer at deploy.",
    },
    {
      q: "How would you set expectations with an agency about GovCMS availability and support?",
      a: "I would quote the published Example GovCMS MOU rather than a number off a slide: the contractor will use commercially reasonable efforts to make the platform available for 99.95% during any calendar month of the subscription period, with a Service Credit as the remedy. That is a service-level objective under a reasonable-efforts standard, not an absolute guarantee, and the distinction matters when an agency is writing its own service commitments downstream. On support, the service desk publishes acknowledgement and reaction targets by severity — critical is 60 minutes acknowledgement 24/7 with an immediate best-effort reaction, high is 4 business hours then 8 — and it states outright that due to the varying nature of issues it cannot provide a resolution time. Business hours are Melbourne-based, so I plan release windows around them.",
    },
    {
      q: "Where does accessibility sit in the shared-responsibility model?",
      a: "With the agency, and this is one place the GovCMS site genuinely contradicts itself, so I quote both sides. The platform page says GovCMS is set up to meet WCAG 2.1 out of the box and that individual agencies need to ensure their website continues to meet accessibility standards; the guidance pages say Australian Government agencies are required to comply with WCAG 2.0 Level AA under the Web Accessibility National Transition Strategy. **Level AA is the only constant**, and the version number is not worth arguing about in a room. Practically, the distribution ships Claro and Olivero and a reasonable baseline, but on SaaS the theme is the code you actually own, so every conformance regression is authored in the one directory the platform lets you deploy. I would not promise conformance as an inherited platform property.",
    },
  ],
  quiz: [
    {
      question:
        "An agency is on GovCMS SaaS. Which files from their project repository end up inside the production container image?",
      options: [
        "The whole repository, built with composer install during rollout",
        "web/modules/custom, themes/ and config",
        "themes/, config and favicon.ico",
        "Only config, because SaaS is configuration-only",
      ],
      answerIndex: 2,
      explain:
        "`.docker/Dockerfile.saas` has exactly three COPY lines after the FROM: `COPY themes/ /app/web/themes/custom`, `COPY config /app/config` and `COPY favicon.ico /app/web`. Drupal, the profile and the pinned drupal/* packages arrive in the `govcms/govcms` base image — a SaaS repo has no composer.json at all, and custom modules have no ship path.",
    },
    {
      question:
        "Which responsibility moves from the platform to the agency when a site is on PaaS rather than SaaS?",
      options: [
        "Drupal security updates and application maintenance",
        "Backups of the database",
        "Drupal infrastructure maintenance",
        "Provisioning of the Lagoon environments",
      ],
      answerIndex: 0,
      explain:
        "The /pricing 'plans at a glance' table marks Drupal security updates, Drupal application maintenance and IRAP assessment as Included on SaaS and \"You're responsible\" on PaaS. Drupal infrastructure maintenance and backups stay Included on both, which is exactly why PaaS is not 'you host it yourself'.",
    },
    {
      question:
        "How many service offerings does GovCMS market, and how many project types does the scaffold tooling provision?",
      options: [
        "Three marketed (SaaS, PaaS, SaaS Plus); three provisioned",
        "Two marketed (SaaS, PaaS); two provisioned",
        "One marketed; three provisioned (saas, paas, saasplus)",
        "Two marketed (SaaS, PaaS); three provisioned (saas, paas, saasplus)",
      ],
      answerIndex: 3,
      explain:
        "Public pricing names two offerings: Software as a Service and Platform as a Service. `scripts/scaffold-init.sh` behind `ahoy init <name> <type> <version>` accepts three type values — `saas`, `paas` and `saasplus` — and rejects anything else. Saying 'GovCMS markets three offerings' is the error; saying 'the tooling provisions a third type' is accurate.",
    },
    {
      question:
        "What actually restricts which modules a GovCMS site may enable?",
      options: [
        "The deploy validators, which fail the rollout when an off-list module is found in core.extension.yml",
        "The `managed_modules` allow list in module_permissions, applied via scaffold-tooling's security.settings.php",
        "Drupal core's own module dependency resolution against the profile's install list",
        "The Shipshape required/disallowed module lists run during post-rollout",
      ],
      answerIndex: 1,
      explain:
        "`$config['module_permissions.settings']['managed_modules']` in scaffold-tooling's `drupal/settings/security.settings.php` — 73 entries, backed by contrib `drupal/module_permissions` — is the mechanism that gates enabling. The validators and Shipshape check a much shorter required/disallowed set after the fact and are not the allow list; and `administer modules` sits on the four-name permission denylist, so the Extend page is not a way around it.",
    },
  ],
};

export default lesson;
