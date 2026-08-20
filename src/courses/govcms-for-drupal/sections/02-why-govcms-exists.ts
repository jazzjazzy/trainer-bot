import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "why-govcms-exists",
  title: "2013 to 400 Sites: The Problem GovCMS Was Built to Solve",
  part: "Why GovCMS Exists",
  estMinutes: 13,
  summary:
    "GovCMS was created to fix a procurement and compliance problem across the Australian Government estate, and almost every constraint you will meet on the platform is a direct consequence of that origin.",
  concept: `## A procurement problem that happened to need a CMS

In 2013 the Department of Finance needed a new content management solution for the
flagship website Australia.gov.au. What it found when it looked sideways at the rest
of government was not a Drupal problem. Agencies "were using hundreds of different
content management systems and hosting solutions. This created a complex procurement
and compliance challenge. It also didn't provide economies of scale."

Read that as an engineer rather than as marketing. Every distinct CMS-plus-hosting
pair in the estate owes its own security assessment, its own patching cadence, its
own backup and restore story, its own hosting contract. None of those artefacts
amortise across agencies. Thirty stacks means thirty security postures and thirty
different answers to "are we patched?", each of which somebody has to fund, staff
and re-evidence every year.

### Create once and share with everyone

That sentence is the stated founding principle, and in 2014 Finance started a
project to open the platform to other agencies. The service was set up to, among
other things:

- reduce the technology and compliance burden on agencies
- provide a cost effective option for managing websites and keeping them secure
- make it easier to collaborate and innovate with other agencies

GovCMS launched in March 2015 on a platform provided by Acquia on AWS. In 2018 the
hosting contract went back to market and Salsa Digital, backed by a partnership with
amazee.io, won it. That recontracting is why the platform you deploy to today is
Drupal on Lagoon with Kubernetes, Docker and GitLab underneath, rather than an
Acquia workflow — the history is load-bearing on your daily tooling, not trivia.

### The argument, restated as a rule

\`\`\`text
platform artefacts owed  =  (distinct CMS + hosting pairs) x (artefacts per platform)
site artefacts owed      =  (sites) x (artefacts that stay with the agency)
\`\`\`

Consolidating collapses the first term to one, and leaves the second term untouched.
That is why the saving is structural rather than a volume discount: the first term
stops growing with the estate. Whether GovCMS carries 58 sites (its first year), 106
(late 2016) or the numbers on the homepage counter today, it is still one platform
to assess.

### Why this is the answer to "why so many guardrails?"

A Drupal developer meeting GovCMS for the first time usually experiences it as a
list of things taken away: you cannot enable an arbitrary module, you cannot ship a
custom module on SaaS, your \`.lagoon.yml\` is not yours to edit. Every one of those
is the shared platform defending the assumption that makes the first term equal one.
The moment a site can diverge, the estate has two platforms to assess again.

### What the shared platform does not absorb

The second term does not move. Conformance of your theme and your content to
accessibility standards remains the agency's, and GovCMS says so explicitly on its
own accessibility guidance. Deciding what may be published, and at what
classification, stays with the agency too. In an interview, being able to name the
boundary — what consolidation actually bought, and what it did not — is worth more
than reciting the founding date.

Treat the origin story as the platform's design rationale. It predicts the answer to
most "can I…?" questions before you have looked at a single config file.`,
  comparisons: [
    {
      label: "Where the site's own settings come from",
      intro:
        "On a site you control, settings.php is a file you own and tune per environment. On GovCMS the same values are supplied by the platform's tooling so that every site resolves them identically.",
      php: `<?php

// web/sites/default/settings.php on a Drupal site you own.
// You choose the paths, and each site in the agency chooses differently.
$databases['default']['default'] = [
  'driver' => 'mysql',
  'database' => 'mysite',
  'username' => 'mysite',
  'password' => 'mysite',
  'host' => 'db',
];

$settings['config_sync_directory'] = '../config/sync';
$settings['file_private_path'] = '/var/www/private';
$settings['trusted_host_patterns'] = ['^www\\.example\\.gov\\.au$'];

// Local overrides you added yourself, in a pattern you invented.
if (file_exists(__DIR__ . '/settings.local.php')) {
  include __DIR__ . '/settings.local.php';
}`,
      ts: `<?php

// Equivalent values on GovCMS, supplied by govcms/scaffold-tooling.
// Nothing here is a per-site decision, which is the entire point.
$settings['config_sync_directory'] = '../config/default';

$settings['file_public_path'] = 'sites/default/files';
$settings['file_private_path'] = 'sites/default/files/private';
$settings['file_temp_path'] = 'sites/default/files/private/tmp';

// Private files live INSIDE the public tree, because both sit on the one
// Lagoon persistent volume. Do not "fix" this.

// The local-override hook the docblock advertises is spelled
// 'settings.project.php' there, but the executing code looks for
// 'project.settings.php'. On SaaS neither that file nor
// settings.local.php is reachable anyway.`,
      note: "The saving is not that GovCMS picked better paths — it is that the whole fleet — the govcms.gov.au counter reads 397 live websites — resolves the same paths, so one runbook, one backup design and one assessment cover all of them.",
    },
    {
      label: "Defining what happens on deploy",
      intro:
        "Who owns the deployment sequence? On your own infrastructure it is a CI job you wrote. On GovCMS it is a platform-managed rollout, and on SaaS the file that declares it is one you are not permitted to change.",
      php: `# .gitlab-ci.yml on a Drupal site you fully control.
# You invented this sequence and you can change it this afternoon.
deploy:production:
  stage: deploy
  only:
    - main
  script:
    - composer install --no-dev --optimize-autoloader
    - rsync -az --delete ./ deploy@prod:/var/www/mysite/
    - ssh deploy@prod "cd /var/www/mysite && vendor/bin/drush deploy -y"
    - ssh deploy@prod "cd /var/www/mysite && vendor/bin/drush cr"
  environment:
    name: production
    url: https://www.example.gov.au`,
      ts: `# .lagoon.yml -- the eight post-rollout tasks GovCMS runs, in this order.
# On SaaS this file is in the locked list: a push that changes it is declined.
tasks:
  post-rollout:
    - run:
        name: Prepare the site for deployment
        command: govcms-update_site_alias
        # No "when:" line. This is the one task nothing can switch off.
    ## START SaaS-only
    - run:
        name: Perform GovCMS platform validations
        command: shipshape run -f /app/vendor/govcms/scaffold-tooling/shipshape.yml --exclude-db --error-code .
        when: withDefault("GOVCMS_SKIP_AUDIT", false) == false
    ## END SaaS-only
    - run:
        name: Synchronise the database
        command: govcms-db-sync
        when: withDefault("GOVCMS_SKIP_DB_SYNC", false) == false
    - run:
        name: Perform database updates
        command: govcms-db-update
        when: withDefault("GOVCMS_SKIP_DB_UPDATE", false) == false
    - run:
        name: Perform config import
        command: govcms-config-import
        when: withDefault("GOVCMS_SKIP_CONFIG_IMPORT", false) == false
    - run:
        name: Perform cache rebuild
        command: govcms-cache-rebuild
        when: withDefault("GOVCMS_SKIP_CACHE_REBUILD", false) == false
    - run:
        name: Ensure GovCMS/Lagoon modules are enabled
        command: govcms-enable_modules
        when: withDefault("GOVCMS_SKIP_ENABLE_MODULES", false) == false
    - run:
        name: Preserve the last successful backup
        command: govcms-backups-preserve
        when: withDefault("GOVCMS_SKIP_PRESERVE_BACKUP", false) == false`,
      note: "Seven of the eight post-rollout tasks are wrapped in a GOVCMS_SKIP_* guard; the first has none. The SaaS-only markers are literally sed-deleted by the scaffold when you initialise a paas project.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
    {
      label: "Adding a module to the site",
      intro:
        "The most common thing a Drupal developer does. On a site you own it is two commands. On GovCMS the question 'may this site enable that?' is answered by configuration you did not write.",
      php: `# A Drupal site you control: require it, enable it, export it.
composer require drupal/webform:^6.3
vendor/bin/drush en webform webform_ui -y
vendor/bin/drush config:export -y
git add composer.json composer.lock config/sync
git commit -m "Add webform"

# Nothing checks this decision except code review.`,
      ts: `<?php

// scaffold-tooling ships this as Drupal configuration, not as a policy PDF.
// The contrib module drupal/module_permissions enforces it at runtime.
$config['module_permissions.settings']['managed_modules'] = [
  'bigmenu',
  'captcha',
  'context',
  'govcms_dlm',
  'pathauto',
  'webform',
  'webform_ui',
  // ...73 names in total live in the shipped file.
];

// The gatekeeper protects itself from being switched off.
$config['module_permissions.settings']['protected_modules'] = [
  'module_permissions',
  'module_permissions_ui',
];

// And it revokes the permissions that would route around it.
$config['module_permissions.settings']['permission_blacklist'] = [
  'administer modules',
  'administer permissions',
  'administer search_api',
  'assign all roles',
];`,
      note: "This allowlist — not the deploy validators — is what actually restricts which modules a site may enable. On SaaS the point is moot for anything you would composer require, because only themes/, config/ and favicon.ico enter the image at all.",
      leftLang: "bash",
    },
    {
      label: "Proving the site is compliant",
      intro:
        "Consolidation only pays if the evidence is produced the same way everywhere. Compare the audit you would hand-roll for one site with the check the platform runs on every SaaS site's deploy.",
      php: `#!/usr/bin/env bash
# audit.sh -- the compliance check you wrote for your own Drupal site.
# It exists because you remembered to write it, and it checks what you chose.
set -euo pipefail

echo "== enabled modules =="
vendor/bin/drush pm:list --status=enabled --format=list

echo "== roles and permissions =="
vendor/bin/drush role:list --format=json > /tmp/roles.json

echo "== dangerous functions in custom code =="
grep -rn --include=*.php -E 'eval\\(|shell_exec\\(|phpinfo\\(' web/modules/custom || true

echo "== dependency advisories =="
composer audit --no-dev

# Every other agency in the estate wrote a different version of this file.`,
      ts: `# The same job on GovCMS: one validator, one config, every SaaS deploy.
# Run it locally exactly as the platform does -- drush and shipshape never
# execute on your host, only inside the cli container.
ahoy drush status

docker compose exec -T cli \\
  shipshape run -f /app/vendor/govcms/scaffold-tooling/shipshape.yml \\
  --exclude-db --error-code .

# Shipshape runs EVERY check, then exits 2 only if the result list is Fail and
# at least one breach is at or above --fail-severity (default: high).
# It does not stop at the first problem. Stage-level short-circuiting is a
# GitLab behaviour, not a Shipshape one.`,
      note: "On SaaS the agency neither commissions this audit nor controls it — the task is sed-deleted outright when the scaffold initialises a PaaS project, and even on SaaS it carries a GOVCMS_SKIP_AUDIT guard the platform holds, not you. That one assessment, executed identically across the SaaS estate, is the economic argument of 2013 rendered as a pipeline step.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],
  playground: {
    intro:
      "A fragmentation-cost model. Platform artefacts are owed once per distinct CMS-plus-hosting pair; site artefacts are owed once per site whoever hosts it. Consolidation collapses the first term and leaves the second alone — watch which column stops growing.",
    lang: "php",
    code: `<?php

// The 2013 argument as arithmetic.
//
// RULE 1: a platform artefact is owed once per DISTINCT (cms + hosting) pair.
// RULE 2: a site artefact is owed once per SITE, whoever hosts it.

$agencies = [
  ['agency' => 'Sports authority', 'cms' => 'Drupal 7', 'hosting' => 'agency data centre'],
  ['agency' => 'Communications', 'cms' => 'Drupal 7', 'hosting' => 'managed VPS'],
  ['agency' => 'Statistics', 'cms' => 'Squiz Matrix', 'hosting' => 'agency data centre'],
  ['agency' => 'Taxation', 'cms' => 'Sitecore', 'hosting' => 'vendor cloud'],
  ['agency' => 'Social services', 'cms' => 'WordPress', 'hosting' => 'managed VPS'],
  ['agency' => 'Audit office', 'cms' => 'Drupal 6', 'hosting' => 'agency data centre'],
  ['agency' => 'Film archive', 'cms' => 'WordPress', 'hosting' => 'managed VPS'],
  ['agency' => 'IP office', 'cms' => 'bespoke PHP', 'hosting' => 'vendor cloud'],
  ['agency' => 'Human services', 'cms' => 'Drupal 7', 'hosting' => 'agency data centre'],
  ['agency' => 'Anti-doping', 'cms' => 'WordPress', 'hosting' => 'shared host'],
];

// Owed once per distinct platform. These are what consolidation buys.
$platformArtefacts = [
  'Security assessment',
  'Patching runbook',
  'Backup and restore plan',
  'Hosting contract',
];

// Owed once per site. These do NOT move to the platform.
$siteArtefacts = [
  'Theme and content accessibility conformance',
  'Classification of the content published',
];

$combos = [];
foreach ($agencies as $a) {
  $key = $a['cms'] . ' on ' . $a['hosting'];
  $combos[$key] = ($combos[$key] ?? 0) + 1;
}
ksort($combos);

$sites = count($agencies);
$distinct = count($combos);
$perPlatform = count($platformArtefacts);
$perSite = count($siteArtefacts);

echo "DISTINCT PLATFORMS IN THE ESTATE\\n";
foreach ($combos as $key => $n) {
  printf("  %-34s %d site(s)\\n", $key, $n);
}

$before = $distinct * $perPlatform + $sites * $perSite;
$after = $perPlatform + $sites * $perSite;

printf("\\n%-32s %11s %8s\\n", 'COMPLIANCE ARTEFACT LOAD', 'FRAGMENTED', 'SHARED');
printf("%-32s %11d %8d\\n", 'Sites', $sites, $sites);
printf("%-32s %11d %8d\\n", 'Distinct platforms to assess', $distinct, 1);
printf("%-32s %11d %8d\\n", 'Platform artefacts owed', $distinct * $perPlatform, $perPlatform);
printf("%-32s %11d %8d\\n", 'Site artefacts owed (unmoved)', $sites * $perSite, $sites * $perSite);
printf("%-32s %11d %8d\\n", 'TOTAL', $before, $after);
printf("Reduction: %d artefacts, %.1f%% of the total\\n", $before - $after, ($before - $after) / $before * 100);

$ratio = $distinct / $sites;
printf("\\nPLATFORM ARTEFACTS AS THE ESTATE GROWS (fragmentation ratio %.2f)\\n", $ratio);
printf("%-8s %11s %8s\\n", 'SITES', 'FRAGMENTED', 'SHARED');
foreach ([10, 58, 106, 397] as $n) {
  printf("%-8d %11d %8d\\n", $n, (int) ceil($n * $ratio) * $perPlatform, $perPlatform);
}

echo "\\nThe SHARED column is flat. That is a structural saving, not a discount.\\n";`,
    output: `DISTINCT PLATFORMS IN THE ESTATE
  Drupal 6 on agency data centre     1 site(s)
  Drupal 7 on agency data centre     2 site(s)
  Drupal 7 on managed VPS            1 site(s)
  Sitecore on vendor cloud           1 site(s)
  Squiz Matrix on agency data centre 1 site(s)
  WordPress on managed VPS           2 site(s)
  WordPress on shared host           1 site(s)
  bespoke PHP on vendor cloud        1 site(s)

COMPLIANCE ARTEFACT LOAD          FRAGMENTED   SHARED
Sites                                     10       10
Distinct platforms to assess               8        1
Platform artefacts owed                   32        4
Site artefacts owed (unmoved)             20       20
TOTAL                                     52       24
Reduction: 28 artefacts, 53.8% of the total

PLATFORM ARTEFACTS AS THE ESTATE GROWS (fragmentation ratio 0.80)
SITES     FRAGMENTED   SHARED
10                32        4
58               188        4
106              340        4
397             1272        4

The SHARED column is flat. That is a structural saving, not a discount.
`,
  },
  keyPoints: [
    "The trigger was operational, not ideological: in 2013 Finance needed a new CMS for Australia.gov.au and found agencies running hundreds of different content management systems and hosting solutions — a complex procurement and compliance challenge with no economies of scale.",
    "'Create once and share with everyone' is the stated founding principle; the project to open the platform to other agencies started in 2014 and GovCMS launched in March 2015.",
    "The published goals are specific and worth quoting: reduce the technology and compliance burden on agencies, and provide a cost effective option for managing websites and keeping them secure.",
    "The saving is structural because assessment, patching, backup and hosting-contract effort collapses to one platform regardless of how many sites join — it is not a bulk-purchase discount.",
    "Consolidation does not absorb everything: conformance of your theme and content to accessibility standards, and the classification of what you publish, remain the agency's responsibility.",
    "Today's tooling is a consequence of the 2018 recontracting to Salsa Digital with amazee.io — Drupal on Lagoon, with Kubernetes, Docker and GitLab — not of the original Acquia-on-AWS arrangement.",
  ],
  interview: [
    {
      q: "Why does GovCMS exist? Give me the version you'd say to an agency executive.",
      a: "GovCMS came out of a 2013 problem at the Department of Finance: they needed a new CMS for Australia.gov.au, and discovered agencies were running hundreds of different content management systems and hosting solutions, which made procurement and compliance complex and gave government no economies of scale. The founding principle was 'create once and share with everyone', and the project to open the platform to other agencies started in 2014. The pitch to an executive is that the technology and compliance burden moves off their balance sheet: one security assessment, one patching cadence and one hosting contract now cover the whole estate instead of theirs alone. What I'd add — and what shows I've operated it — is that the second half of the burden does not move. Accessibility conformance of their theme and content, and the classification of what they publish, stay with them, and if nobody says that out loud during onboarding it becomes a nasty surprise at the first audit.",
    },
    {
      q: "A client is frustrated that GovCMS won't let them enable a module or ship a custom module on SaaS. How do you handle that conversation?",
      a: "I reframe it from restriction to arithmetic. The platform's whole economic case rests on there being one platform to assess rather than one per agency, so the moment a site can diverge arbitrarily, the estate is back to N assessments and the cost model collapses. Concretely, the restriction is not a policy document — it is the `module_permissions.settings.managed_modules` allowlist shipped as configuration by scaffold-tooling, and on SaaS the point is largely moot anyway because only `themes/`, `config/` and `favicon.ico` are copied into the image. Then I get practical: I check whether the distribution already ships the capability, and if the requirement genuinely needs services, routes or a custom module, that is the honest trigger for a PaaS conversation rather than a fight with the validators.",
    },
    {
      q: "What did consolidating onto GovCMS actually take off an agency's plate, and what did it not?",
      a: "It absorbed the artefacts that are owed once per platform: the security assessment, the patching runbook, the backup and restore design, the hosting contract, and the infrastructure monitoring behind them. It did not absorb the artefacts that are owed once per site — most visibly accessibility, where GovCMS states the platform is set up to meet WCAG at Level AA out of the box but that individual agencies need to ensure their website continues to meet accessibility standards. Content classification is the same shape: the platform is certified to host information up to OFFICIAL: Sensitive, but deciding what goes on the site is the agency's call. In practice the two things I check earliest on a new engagement are whether the theme has ever been tested for accessibility, and whether the site does authentication, collects personal information or takes payments — because GovCMS explicitly asks you to talk to them early about all three.",
    },
    {
      q: "Walk me through GovCMS's history and tell me why any of it matters to a developer.",
      a: "It launched in March 2015 on a platform provided by Acquia on AWS, with the Australian Sports Anti-Doping Authority as the first site, and grew fast enough through 2016 to beat its own adoption projections. In 2017 Finance established the Drupal Services Panel so agencies had a procurement route to build and maintain their sites. The part that matters technically is 2018: the hosting contract went back to market and Salsa Digital, in partnership with amazee.io, won it, which is why the platform today is Drupal running on Lagoon with Kubernetes, Docker and GitLab underneath. If you interview having only read about the Acquia era you will describe a deployment workflow that no longer exists — the thing you actually deal with is a `.lagoon.yml` post-rollout task list and a container-based local stack driven by ahoy.",
    },
  ],
  quiz: [
    {
      question:
        "What immediately prompted the work that became GovCMS?",
      options: [
        "A Digital Transformation Agency directive requiring agencies to consolidate onto a single CMS",
        "A major security incident across several Commonwealth websites",
        "The Department of Finance needing a new content management solution for Australia.gov.au in 2013",
        "Drupal 7 reaching end of life and forcing a whole-of-government migration",
      ],
      answerIndex: 2,
      explain:
        "GovCMS's own account is specific: in 2013 the Department of Finance needed a new content management solution for the flagship website Australia.gov.au, and that created the opportunity to think bigger once they noticed agencies were running hundreds of different CMSs and hosting solutions. There was no consolidation mandate, no triggering incident, and Drupal 7's end of life came far later.",
    },
    {
      question:
        "Which phrase does GovCMS name as its founding principle?",
      options: [
        "Create once and share with everyone",
        "Build once, deploy many",
        "Secure by default, open by design",
        "One platform, many agencies",
      ],
      answerIndex: 0,
      explain:
        "'Create once and share with everyone' is the phrase GovCMS names as its founding principle, and it is the ethos it credits for the platform's open-source posture. The other three are plausible-sounding paraphrases, and quoting one of them in an interview signals you read a summary rather than the source.",
    },
    {
      question:
        "Why is the compliance saving from GovCMS described as structural rather than a discount?",
      options: [
        "Because Finance negotiated bulk pricing with the hosting provider on behalf of all agencies",
        "Because agencies no longer have any accessibility or classification obligations of their own",
        "Because the platform absorbs the cost of each agency's individual security assessment as a subsidy",
        "Because assessment, patching, backup and hosting-contract effort is owed once per distinct platform, so that cost stops growing as sites are added",
      ],
      answerIndex: 3,
      explain:
        "Artefacts like the security assessment and patching runbook are owed once per distinct CMS-plus-hosting combination, not once per site — so consolidating collapses that term to one and it stays at one as the estate grows. Bulk pricing would be a discount, not a structural change. And agencies definitely keep their own obligations: accessibility conformance of the theme and content, and classification of what is published, do not move to the platform.",
    },
    {
      question:
        "Which change in GovCMS's history explains the Lagoon-based tooling a developer works with today?",
      options: [
        "The 2017 establishment of the Drupal Services Panel through a request for tender",
        "The 2018 refresh of the hosting services contract, won by Salsa Digital in partnership with amazee.io",
        "The March 2015 launch on a platform provided by Acquia on AWS",
        "The 2016 IPAA innovation award and the resulting community co-development work",
      ],
      answerIndex: 1,
      explain:
        "GovCMS went back to market for hosting in 2018 and Salsa Digital, backed by a partnership with amazee.io, won the contract; the platform has run on Drupal plus the open-source Lagoon platform since. The 2015 launch was Acquia on AWS, the Drupal Services Panel is a procurement vehicle for finding developers rather than a hosting change, and the IPAA award was recognition, not infrastructure.",
    },
  ],
};

export default lesson;
