import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "operating-a-live-site",
  title: "Who Fixes This? Security Updates, Service Desk and the SLA",
  part: "Lagoon: Deploy & Run",
  estMinutes: 13,
  summary:
    "The operational half of the shared-responsibility model: who applies Drupal security updates on each offering, when a ticket beats a commit, and how to quote the published response and availability targets without overselling them.",
  concept: `## The split is written down, not folklore

On a Drupal site you control, "who fixes this" is an internal argument. On GovCMS it is answered in the published Example GovCMS MOU, in two clauses worth memorising.

- **SaaS (clause 3.14.4)** — Finance is responsible for the security (including security accreditation) and maintenance of "the infrastructure, GovCMS platform and GovCMS Distribution", *except to the extent that the Entity has incorporated its own customised services or features*.
- **PaaS (clause 3.14.5)** — Finance is responsible for "the infrastructure only", and is explicitly **not** responsible for "the security including patching and maintenance of any Drupal Distribution used on a PaaS service".

Everything operational falls out of those two sentences.

### When an advisory drops

On SaaS you do nothing to the codebase. govcms.gov.au states the distribution is released "approximately once a month" and "is automatically applied for our Software-as-a-Service (SaaS) customers". The MOU puts clocks on it under a *Drupal Security Patches (SaaS only)* service level: highly critical patches to production within 48 hours, critical within 7 days, monthly for non-critical, classified by the drupal.org risk levels. Infrastructure patches sit with the contractor — critical within 24 hours, non-critical weekly in the maintenance window.

What you still own on SaaS is the carve-out: your theme, your content, your user accounts. A cross-site scripting hole in a theme preprocess function is yours, at 2am, forever.

On PaaS the advisory is your ticket to close. You update \`govcms/govcms\` in your own project and deploy it, and you carry the IRAP assessment of the application layer at your own cost — the platform assessment covers infrastructure only. The published consequence of drifting is not subtle: *"If you get behind on security updates, the GovCMS team will step in and make these updates for you. This will mean additional costs that will be billed to your project."*

### Ticket, or commit?

Ask two questions in order: **who owns the layer**, and **do I have a lever**. On SaaS the second question bites even where you own the layer. There is no shell, and \`.docker/*\`, \`.ahoy.yml\`, \`.env.default\`, \`.gitlab-ci.yml\`, \`.lagoon.yml\`, \`.version.yml\`, \`README.md\` and \`docker-compose.yml\` are locked — a push that changes them "will be declined and the git push will fail". Cron schedules, enabling anything outside the managed module allowlist, backup restores, DNS and TLS are service desk work.

The desk is a severity machine. Tickets route to Salsa Digital via Freshdesk, and only nominated contacts can raise them:

\`\`\`text
Impact     Acknowledgement      Reaction
Critical   60 minutes (24/7)    Immediate (best effort)
High       4 business hours     8 business hours
Medium     4 business hours     2 business days
Low        4 business hours     2 business days
\`\`\`

Hours are Monday to Friday, 8:30am - 5:30pm AEDT, excluding Victorian public holidays; critical is 24/7. Read what is *absent*: "due to the varying nature of issues, we are unable to provide a resolution time", and the desk "does not support design, development, or discovery services". Response is committed. Repair is not.

### Saying the uptime number correctly

The MOU: the contractor "will use commercially reasonable efforts to make the platform available for 99.95% during any calendar month", with a Service Credit as the remedy. That is a genuine published commitment under a soft standard — neither an absolute guarantee nor marketing. The maintenance page separately quotes a 99.9% figure; they are different published numbers, so cite one and name its source.`,
  comparisons: [
    {
      label: "A Drupal core security release lands",
      intro:
        "Same advisory, three different jobs. On a site you control you are the release manager; on SaaS there is no core dependency in your repository to bump; on PaaS the work is yours but against the distribution package.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal 11: you own the whole dependency tree.
composer update drupal/core-recommended drupal/core-composer-scaffold \\
  drupal/core-project-message --with-all-dependencies

vendor/bin/phpunit --testsuite unit
git commit -am "Core security release"
git push origin main

# Your deploy, your order, your rollback plan.
drush deploy
drush core:status --field=drupal-version`,
      ts: `# GovCMS SaaS: your repo contains themes/, config/ and favicon.ico.
# There is no drupal/core-recommended here to update. The distribution
# ships roughly monthly and is applied for SaaS customers as a rebuilt
# image; the MOU sets 48 hours to production for highly critical patches.
git log --oneline -1     # still your last theme commit

# GovCMS PaaS: the same advisory is yours to close.
# The scaffold ships "govcms/govcms": "4.x-master-dev"; you may pin a tag.
composer update govcms/govcms --with-all-dependencies
ahoy up && ahoy drush updb -y      # prove it locally first
git push origin master             # the pipeline deploys it`,
      note:
        "The SaaS answer is 'nothing, and here is the clause that says so'. The PaaS answer is 'this week, before the GovCMS team steps in and bills us'.",
    },
    {
      label: "Finding out you are behind",
      intro:
        "A vanilla site tells you it is insecure. A GovCMS site cannot: core's Update Status module is on the validators' disallowed list and is not enabled, so the only version you can read at runtime is the one the platform gave you.",
      php: `<?php

namespace Drupal\\agency_ops;

use Drupal\\Core\\Extension\\ModuleHandlerInterface;
use Drupal\\update\\UpdateManagerInterface;

/**
 * Reports insecure projects on a site where you control the codebase.
 */
final class SecurityStatus {

  public function __construct(
    private readonly ModuleHandlerInterface $moduleHandler,
  ) {}

  public function insecureProjects(): array {
    $this->moduleHandler->loadInclude('update', 'inc', 'update.compare');
    $projects = update_calculate_project_data(update_get_available(TRUE));

    $insecure = [];
    foreach ($projects as $name => $project) {
      if (($project['status'] ?? NULL) === UpdateManagerInterface::NOT_SECURE) {
        $insecure[$name] = $project['recommended'];
      }
    }
    return $insecure;
  }

}`,
      ts: `<?php

// themes/agencytheme/agencytheme.theme
//
// 'update' is on the validators' disallowed module list
// (dblog module_permissions_ui statistics update), so there is no
// "Available updates" report to query and no update.settings to read.
// What IS knowable is which distribution build you are running.

/**
 * Implements hook_preprocess_HOOK() for html.
 */
function agencytheme_preprocess_html(array &$variables): void {
  $profile = \\Drupal::service('extension.list.profile')
    ->getExtensionInfo('govcms');

  // e.g. '4.5.0.1'. The 4.5.0.1 tag pins drupal/core-recommended 11.3.14.
  \\Drupal::logger('agencytheme')->info('GovCMS @d on Drupal @c', [
    '@d' => $profile['version'] ?? 'unknown',
    '@c' => \\Drupal::VERSION,
  ]);

  $variables['#cache']['tags'][] = 'config:core.extension';
}`,
      note:
        "On SaaS the logic has to live in the theme, because a module is not deployable there at all. Either way you are recording what the platform handed you, not deciding what to install.",
    },
    {
      label: "2am: production is throwing 500s",
      intro:
        "The same outage, worked two ways. The left column is the runbook you already know. The right column is what is actually available when you have no shell and no rollback task.",
      leftLang: "bash",
      rightLang: "bash",
      php: `ssh webops@prod-web-01
sudo tail -n 200 /var/log/nginx/error.log
sudo journalctl -u php8.3-fpm --since "-15 min"

drush --root=/var/www/site watchdog:show --count=50 --severity=Error
drush --root=/var/www/site sql:dump --result-file=/backups/pre-rollback.sql

git -C /var/www/site revert --no-edit HEAD
drush --root=/var/www/site deploy`,
      ts: `# No shell, no drush, no rollback task in .lagoon.yml, and dblog is
# on the disallowed module list, so watchdog:show has nothing to show.

# 1. Is it you, or the platform? Check your site, then the status page.
curl -s -o /dev/null -w "%{http_code}\\n" https://www.agency.gov.au/

# 2. Log it at a severity you can defend:
#    Critical - production down or go-live blocked, no workaround
#               60 min acknowledgement (24/7), immediate best-effort reaction
#    High     - disrupted but operational, production deploys failing
#               4 business hours ack, 8 business hours reaction

# 3. What you can still do yourself: reverse your own change.
git revert --no-edit HEAD
git push origin master   # a fresh rollout is the rollback`,
      note:
        "Severity is chosen from business impact, not from your adrenaline. If it gets worse, update the Freshdesk ticket and the team re-assesses rather than opening a second one.",
    },
    {
      label: "The ops knobs in your repository",
      intro:
        "On a site you control, operational behaviour is configuration you own and deploy. On GovCMS, the notification config does not exist and the scheduling file is platform-managed.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/sync/update.settings.yml - exported from a site you control.
# Core's Update Status emails you the moment a release is marked insecure.
# threshold is constrained to [all, security] in update.schema.yml, and
# update.settings is FullyValidatable, so a third value fails config import.
check:
  disabled_extensions: true
  interval_days: 1
fetch:
  url: ~
  max_attempts: 2
  timeout: 30
notification:
  emails:
    - webops@agency.gov.au
  threshold: security`,
      ts: `# .lagoon.yml - the scaffold's only scheduling knob, and on SaaS it is
# one of the locked files: a push that changes it is declined.
environments:
  master:
    cronjobs:
      - name: Drupal cron with notifications
        schedule: "M * * * *"
        command: '/app/vendor/bin/govcms-drush cron --root=/app'
        service: cli

# The file's own comment names its editors: "PaaS users or the support
# team". On SaaS, changing this schedule is a service desk request.`,
      note:
        "There is no update.settings.yml in config/default because the update module is never enabled. Release notes, the status page and the service desk are the notification channel.",
    },
  ],
  playground: {
    intro:
      "An incident router: eight real events, resolved against the two questions from the concept - who owns the layer under MOU clauses 3.14.4 and 3.14.5, and whether the routine patch cycle already closes it - then the availability objectives converted into allowed downtime.",
    lang: "php",
    code: `<?php

// Layer ownership. Source: Example GovCMS MOU, clause 3.14.4 (SaaS)
// and clause 3.14.5 (PaaS: "the infrastructure only").
$owner = [
  'infrastructure' => ['SaaS' => 'GovCMS', 'PaaS' => 'GovCMS'],
  'platform'       => ['SaaS' => 'GovCMS', 'PaaS' => 'GovCMS'],
  'distribution'   => ['SaaS' => 'GovCMS', 'PaaS' => 'Agency'],
  'contrib'        => ['SaaS' => 'GovCMS', 'PaaS' => 'Agency'],
  'theme'          => ['SaaS' => 'Agency', 'PaaS' => 'Agency'],
  'config'         => ['SaaS' => 'Agency', 'PaaS' => 'Agency'],
  'content'        => ['SaaS' => 'Agency', 'PaaS' => 'Agency'],
  'accounts'       => ['SaaS' => 'Agency', 'PaaS' => 'Agency'],
];

// What the responsible party does, keyed by layer and owner.
$action = [
  'infrastructure|GovCMS' => 'Platform patches it; watch the status page',
  'platform|GovCMS'       => 'Service desk ticket, severity by impact',
  'distribution|GovCMS'   => 'Arrives in the monthly distribution release',
  'contrib|GovCMS'        => 'Arrives in the monthly distribution release',
  'distribution|Agency'   => 'Update govcms/govcms, test, deploy it',
  'contrib|Agency'        => 'Update the package, test, deploy it',
  'theme|Agency'          => 'Patch themes/, push, pipeline deploys it',
  'config|Agency'         => 'Fix config/default, push, config import runs',
  'content|Agency'        => 'Fix it in the CMS; no deploy involved',
  'accounts|Agency'       => 'Fix it in the CMS; no deploy involved',
];

$events = [
  ['Drupal core SA, highly critical', 'distribution'],
  ['Contrib SA inside the distribution', 'contrib'],
  ['Host OS / kernel patch due', 'infrastructure'],
  ['Platform 500s, site unreachable', 'platform'],
  ['XSS in a custom theme preprocess', 'theme'],
  ['Role granted too much in config', 'config'],
  ['Editor published a draft early', 'content'],
  ['Departed contractor still has login', 'accounts'],
];

// The whole routing rule. Owning the layer is not the same as needing a
// ticket: most GovCMS-owned work simply arrives on the patch cycle.
function ticket(string $who, string $action): string {
  if ($who !== 'GovCMS') {
    return 'no, you fix it';
  }
  return str_starts_with($action, 'Service desk')
    ? 'YES service desk'
    : 'no, it just arrives';
}

echo "INCIDENT ROUTER  ticket only when GovCMS owns it AND the cycle will not\\n";
foreach (['SaaS', 'PaaS'] as $offering) {
  printf("\\n-- %s --\\n", $offering);
  printf("%-36s %-7s %-44s %s\\n", 'EVENT', 'OWNER', 'ACTION', 'TICKET?');
  foreach ($events as [$label, $layer]) {
    $who = $owner[$layer][$offering];
    $act = $action[$layer . '|' . $who];
    printf("%-36s %-7s %-44s %s\\n", $label, $who, $act, ticket($who, $act));
  }
}

// Availability objectives -> allowed downtime. 30-day month, 365-day year.
$targets = [
  ['99.95', 'Example GovCMS MOU, per calendar month'],
  ['99.90', 'govcms.gov.au maintenance page'],
];

echo "\\nALLOWED DOWNTIME  commercially reasonable efforts, not a guarantee\\n";
printf("%-8s %-14s %-12s %s\\n", 'TARGET', 'PER MONTH', 'PER YEAR', 'SOURCE');
foreach ($targets as [$pct, $source]) {
  $missed = (100 - (float) $pct) / 100;
  $month = number_format($missed * 43200, 1) . ' min';
  $year = number_format($missed * 525600 / 60, 1) . ' hrs';
  printf("%-8s %-14s %-12s %s\\n", $pct . '%', $month, $year, $source);
}`,
    output: `INCIDENT ROUTER  ticket only when GovCMS owns it AND the cycle will not

-- SaaS --
EVENT                                OWNER   ACTION                                       TICKET?
Drupal core SA, highly critical      GovCMS  Arrives in the monthly distribution release  no, it just arrives
Contrib SA inside the distribution   GovCMS  Arrives in the monthly distribution release  no, it just arrives
Host OS / kernel patch due           GovCMS  Platform patches it; watch the status page   no, it just arrives
Platform 500s, site unreachable      GovCMS  Service desk ticket, severity by impact      YES service desk
XSS in a custom theme preprocess     Agency  Patch themes/, push, pipeline deploys it     no, you fix it
Role granted too much in config      Agency  Fix config/default, push, config import runs no, you fix it
Editor published a draft early       Agency  Fix it in the CMS; no deploy involved        no, you fix it
Departed contractor still has login  Agency  Fix it in the CMS; no deploy involved        no, you fix it

-- PaaS --
EVENT                                OWNER   ACTION                                       TICKET?
Drupal core SA, highly critical      Agency  Update govcms/govcms, test, deploy it        no, you fix it
Contrib SA inside the distribution   Agency  Update the package, test, deploy it          no, you fix it
Host OS / kernel patch due           GovCMS  Platform patches it; watch the status page   no, it just arrives
Platform 500s, site unreachable      GovCMS  Service desk ticket, severity by impact      YES service desk
XSS in a custom theme preprocess     Agency  Patch themes/, push, pipeline deploys it     no, you fix it
Role granted too much in config      Agency  Fix config/default, push, config import runs no, you fix it
Editor published a draft early       Agency  Fix it in the CMS; no deploy involved        no, you fix it
Departed contractor still has login  Agency  Fix it in the CMS; no deploy involved        no, you fix it

ALLOWED DOWNTIME  commercially reasonable efforts, not a guarantee
TARGET   PER MONTH      PER YEAR     SOURCE
99.95%   21.6 min       4.4 hrs      Example GovCMS MOU, per calendar month
99.90%   43.2 min       8.8 hrs      govcms.gov.au maintenance page
`,
  },
  keyPoints: [
    "The Example GovCMS MOU states the split directly: for SaaS, Finance owns security and maintenance of the infrastructure, platform and Distribution except where the entity added its own customisations; for PaaS, Finance owns the infrastructure only and is expressly not responsible for patching the Drupal distribution.",
    "On SaaS the distribution ships roughly monthly and is applied for you, with an MOU service level of 48 hours to production for highly critical Drupal security patches, 7 days for critical and monthly for non-critical, using the drupal.org risk levels.",
    "SaaS does not make you a spectator: theme code, content, config in your repository and user accounts stay yours, and the IRAP assessment for a PaaS application layer is the agency's at its own cost.",
    "Published guidance is explicit that a PaaS site left behind on security updates will be updated by the GovCMS team at additional cost billed to the project.",
    "Service desk targets are acknowledgement and reaction only: Critical 60 minutes 24/7 and immediate best-effort reaction; High 4 business hours then 8 business hours; Medium and Low 4 business hours then 2 business days - with the stated caveat that no resolution time is offered.",
    "Quote availability as the MOU does: commercially reasonable efforts to be available 99.95% in any calendar month, remedied by a Service Credit - about 21.6 minutes of allowed downtime a month, not an absolute guarantee.",
  ],
  interview: [
    {
      q: "On GovCMS SaaS, who applies Drupal security updates, and how fast?",
      a: "GovCMS does. The Example GovCMS MOU makes Finance responsible for the security and maintenance of the infrastructure, the platform and the GovCMS Distribution, and adds a *Drupal Security Patches (SaaS only)* service level: highly critical patches to production within 48 hours, critical within 7 days, monthly patches for non-critical, classified using the drupal.org risk levels. Operationally it arrives as a distribution release - roughly monthly, applied automatically for SaaS customers as a rebuilt image, not as a commit in the site repository. What I still watch is the carve-out: anything the agency added is ours, so an advisory affecting a jQuery library or a pattern we vendored into the theme is a Tuesday morning job for my team. In practice I read the release notes each month and re-run our own theme tests, because the platform patch and our theme land in the same image.",
    },
    {
      q: "You are the vendor for a PaaS site. What is the agency actually carrying that a SaaS agency is not?",
      a: "Clause 3.14.5 makes Finance responsible for the infrastructure only, and expressly not for the security, patching and maintenance of the Drupal distribution used on PaaS. So the agency carries core and contrib updates, module and theme maintenance, the whole application layer - and the IRAP assessment of that layer at its own cost, since the platform assessment covers infrastructure. The MOU's application-tier response and reaction times are labelled SaaS only, and PaaS support is a selected option with service desk and infrastructure support added on, so I never assume an application SLA exists until I have read the entity's Proposal. The published stick is real too: fall behind on security updates and the GovCMS team steps in and bills the project. I price a standing patch window into PaaS engagements for exactly that reason.",
    },
    {
      q: "How do you decide between raising a service desk ticket and fixing something yourself?",
      a: "Two questions. First, who owns the layer under the MOU - if it is infrastructure, the platform or the distribution on SaaS, it is a ticket. Second, do I have a lever even where I own it: on SaaS there is no shell, and `.lagoon.yml`, `.docker/*`, `docker-compose.yml`, `.ahoy.yml`, `.gitlab-ci.yml` and friends are locked, so a push that touches them is declined. That puts cron schedules, enabling anything outside the managed module allowlist, backup restores, DNS and TLS on the ticket side, and leaves theme, content, exported config and user accounts on mine. I also pick severity from business impact rather than panic - production down or a blocked go-live is Critical; failing production deployments with the site still serving is High - because burning Critical on a High issue costs credibility with the desk.",
    },
    {
      q: "A nervous client asks whether GovCMS guarantees 99.95% uptime. What do you say?",
      a: "I say it is a published service level, not an absolute guarantee. The Example GovCMS MOU wording is that the contractor will use commercially reasonable efforts to make the platform available for 99.95% during any calendar month, with a Service Credit as the remedy, apportioned by Finance across affected proposals - and the platform availability line excludes scheduled maintenance windows. I also point out that 99.95% still permits about 21.6 minutes a month, so if the service genuinely cannot tolerate that, the conversation is about their own failover and content caching, not about the SLA. And I flag the gap that catches people out: acknowledgement and reaction times are committed, but the service desk states plainly that it cannot provide a resolution time. If a client wants their own number, we measure it ourselves with external monitoring and reconcile against the status page.",
    },
  ],
  quiz: [
    {
      question:
        "A highly critical Drupal core advisory is published on a Tuesday. Your client runs GovCMS SaaS. What does your team do?",
      options: [
        "Run `composer update drupal/core-recommended` in the site repository and push to master.",
        "Raise a Critical service desk ticket so the platform team knows a patch is needed.",
        "Nothing to the codebase - the distribution release carries the fix and is applied for SaaS customers, with the MOU setting 48 hours to production for highly critical patches.",
        "Enable core's Update Status module and follow the recommended-release link it reports.",
      ],
      answerIndex: 2,
      explain:
        "A SaaS repository holds themes, config and favicon.ico - there is no core dependency in it to update. Finance and the contractor own the distribution under clause 3.14.4, and the SaaS-only Drupal Security Patches service level commits highly critical patches to production within 48 hours. The update module is on the validators' disallowed list, so option 4 cannot happen at all.",
    },
    {
      question: "Which statement about GovCMS availability is defensible?",
      options: [
        "The published Example MOU commits the contractor to commercially reasonable efforts to make the platform available for 99.95% in any calendar month, remedied by a Service Credit.",
        "99.95% is an unconditional guarantee and any shortfall is automatically refunded to the agency.",
        "The 99.95% figure is marketing copy and appears in no contract document.",
        "The MOU commits to 99.9% per month, which the website rounds up to 99.95%.",
      ],
      answerIndex: 0,
      explain:
        "The MOU text is public and reads exactly that way, with the Service Credit as the remedy - so it is neither an absolute guarantee nor non-contractual. The 99.9% figure on the maintenance page is a separate published number from a different source; cite one and name where it came from rather than blending them.",
    },
    {
      question:
        "Production deployments on a client site keep failing, but the live site is still serving traffic normally. Which severity and response should you expect from the GovCMS Service Desk?",
      options: [
        "Critical - 60 minutes acknowledgement 24/7, immediate best-effort reaction.",
        "Medium - 4 business hours acknowledgement, 2 business days reaction.",
        "Low - 4 business hours acknowledgement, addressed in the next distribution release.",
        "High - 4 business hours acknowledgement, 8 business hours reaction.",
      ],
      answerIndex: 3,
      explain:
        "The published business-impact definitions put 'production deployments are failing' and 'disrupted but still operational' under High, which carries 4 business hours to acknowledge and 8 business hours to react. Failing deployments to secondary environments would be Medium. Critical is reserved for a site that is down or extremely impacted, or a blocked go-live with no workaround.",
    },
    {
      question:
        "A PaaS site is six months behind on Drupal security updates. According to published GovCMS guidance, what happens?",
      options: [
        "The platform starts auto-applying the distribution release for them, as it does for SaaS.",
        "The GovCMS team steps in and makes the updates, with the additional cost billed to the project.",
        "Shipshape fails the next rollout and blocks deployment until the updates are applied.",
        "Finance suspends the site's OFFICIAL: Sensitive accreditation until it is remediated.",
      ],
      answerIndex: 1,
      explain:
        "The maintenance page states it directly: get behind on security updates and the GovCMS team will make them for you at additional cost billed to the project. The MOU also gives the contractor a step-in right to investigate and remediate security threats under Finance's direction. Shipshape does not check package versions, and its task sits inside the SaaS-only block of `.lagoon.yml` anyway.",
    },
  ],
};

export default lesson;
